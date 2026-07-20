import "server-only";

import {
  assertSafePublicHttpUrl,
  type SafeUrlFailure,
} from "@/server/security/safe-url";
import {
  requestPinnedPublicUrl,
  type HostRequestGate,
  type SourceUrlValidationDeps,
} from "./source-url-validation";
import { checkRobotsAllowed, type RobotsPolicyDeps } from "./robots-policy";

export type DocumentFetchFailureCode =
  | "INVALID_URL"
  | "BLOCKED_PROTOCOL"
  | "BLOCKED_HOST"
  | "BLOCKED_IP"
  | "DNS_FAILED"
  | "ROBOTS_DISALLOWED"
  | "ROBOTS_UNAVAILABLE"
  | "DOCUMENT_TOO_LARGE"
  | "PDF_NO_EXTRACTABLE_TEXT"
  | "PDF_INVALID"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "TIMEOUT"
  | "HTTP_ERROR"
  | "TOO_MANY_REDIRECTS"
  | "NETWORK_ERROR";

export type FetchedDocument = {
  requestedUrl: string;
  finalUrl: string;
  canonicalUrl: string | null;
  contentType: string;
  statusCode: number;
  title: string | null;
  text: string;
  links: string[];
  byteLength: number;
  fetchedAt: string;
  pdfPagesProcessed: number;
};

export type DocumentFetchResult =
  | { ok: true; document: FetchedDocument; robotsFromCache: boolean }
  | {
      ok: false;
      code: DocumentFetchFailureCode;
      detail: string;
      finalUrl?: string;
      statusCode?: number;
    };

type PdfDocumentLike = {
  numPages: number;
  getPage(pageNumber: number): Promise<{
    getTextContent(): Promise<{ items: Array<{ str?: string }> }>;
  }>;
  destroy(): Promise<void>;
};

export type WebDocumentFetcherDeps = Pick<
  SourceUrlValidationDeps,
  "fetchImpl" | "requestImpl" | "lookupImpl" | "now"
> & {
  timeoutMs: number;
  maxRedirects: number;
  maxDocumentBytes: number;
  maxPdfPages: number;
  userAgent: string;
  robotsCacheTtlMs: number;
  robotsCache?: RobotsPolicyDeps["cache"];
  maxRobotsBytes?: number;
  requestGate?: HostRequestGate;
  urlPolicy?: (url: string) => boolean;
  signal?: AbortSignal;
  loadPdfDocument?: (bytes: Uint8Array) => Promise<PdfDocumentLike>;
};

/** Per-host semaphore used together with the orchestrator's global limit. */
export class HostConcurrencyLimiter {
  private readonly active = new Map<string, number>();
  private readonly queues = new Map<string, Array<() => void>>();

  constructor(private readonly maxPerHost: number) {}

  async run<T>(rawUrl: string, task: () => Promise<T>): Promise<T> {
    const host = new URL(rawUrl).hostname.toLowerCase();
    if ((this.active.get(host) ?? 0) >= Math.max(1, this.maxPerHost)) {
      await new Promise<void>((resolve) => {
        this.queues.set(host, [...(this.queues.get(host) ?? []), resolve]);
      });
    }
    this.active.set(host, (this.active.get(host) ?? 0) + 1);
    try {
      return await task();
    } finally {
      const remaining = (this.active.get(host) ?? 1) - 1;
      if (remaining <= 0) {
        this.active.delete(host);
      } else {
        this.active.set(host, remaining);
      }
      const queue = this.queues.get(host);
      const next = queue?.shift();
      if (queue && queue.length === 0) {
        this.queues.delete(host);
      }
      next?.();
    }
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, decimal: string) =>
      String.fromCodePoint(Number(decimal)),
    );
}

function stripMarkup(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function relevantHtmlText(text: string): string {
  const maxChars = 60_000;
  if (text.length <= maxChars) {
    return text;
  }
  const keywords = /deadline|proposal|submission|eligibility|scope|requirements|contact|apply|aplicaci[oó]n|fecha l[ií]mite|alcance|requisitos|contacto/gi;
  const segments = [text.slice(0, 15_000)];
  let match: RegExpExecArray | null;
  while ((match = keywords.exec(text)) && segments.join("\n").length < maxChars) {
    segments.push(text.slice(Math.max(0, match.index - 700), match.index + 2_000));
  }
  return [...new Set(segments)].join("\n\n").slice(0, maxChars);
}

export function extractHtmlDocument(html: string, finalUrl: string): {
  title: string | null;
  text: string;
  links: string[];
  canonicalUrl: string | null;
} {
  const heading = stripMarkup(
    html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "",
  ).slice(0, 500);
  const htmlTitle = stripMarkup(
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "",
  ).slice(0, 500);
  const title = heading || htmlTitle || null;
  const canonicalHref = html.match(
    /<link\b(?=[^>]*\brel=["'][^"']*canonical[^"']*["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/i,
  )?.[1];
  let canonicalUrl: string | null = null;
  if (canonicalHref) {
    try {
      const candidate = new URL(canonicalHref, finalUrl);
      const safe = assertSafePublicHttpUrl(candidate.toString());
      canonicalUrl =
        safe.ok && safe.url.origin === new URL(finalUrl).origin
          ? safe.url.toString()
          : null;
    } catch {
      canonicalUrl = null;
    }
  }

  const links: string[] = [];
  const anchorPattern = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let anchor: RegExpExecArray | null;
  while ((anchor = anchorPattern.exec(html)) && links.length < 100) {
    try {
      const url = new URL(anchor[1], finalUrl);
      if (!/^https?:$/.test(url.protocol)) {
        continue;
      }
      const label = stripMarkup(anchor[2]);
      const signal = `${url.pathname} ${label}`.toLowerCase();
      if (/pdf|apply|application|proposal|submit|form|procurement|rfp|rfq|tender|licitaci|convocatoria/.test(signal)) {
        links.push(url.toString());
      }
    } catch {
      // Ignore malformed or non-http links.
    }
  }

  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? html;
  const cleaned = main
    .replace(/<(script|style|noscript|svg|nav|footer|header|aside)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/section>|<\/li>|<\/h[1-6]>/gi, "\n");
  const text = relevantHtmlText(
    decodeHtmlEntities(cleaned.replace(/<[^>]+>/g, " "))
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n+/g, "\n")
      .trim(),
  );
  return { title, text, links: [...new Set(links)], canonicalUrl };
}

async function defaultLoadPdfDocument(bytes: Uint8Array): Promise<PdfDocumentLike> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: bytes,
    useSystemFonts: true,
    useWorkerFetch: false,
    useWasm: false,
    enableXfa: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
  });
  const document = await task.promise;
  return {
    numPages: document.numPages,
    getPage: (pageNumber) => document.getPage(pageNumber),
    destroy: () => task.destroy(),
  } as PdfDocumentLike;
}

export async function extractPdfText(
  bytes: Uint8Array,
  maxPages: number,
  loadPdfDocument: (bytes: Uint8Array) => Promise<PdfDocumentLike> =
    defaultLoadPdfDocument,
  signal?: AbortSignal,
): Promise<{ text: string; pagesProcessed: number }> {
  const signature = new TextDecoder("ascii").decode(bytes.slice(0, 5));
  if (signature !== "%PDF-") {
    throw new Error("PDF_INVALID");
  }
  const document = await loadPdfDocument(bytes);
  const pageCount = Math.min(document.numPages, maxPages);
  const pages: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      if (signal?.aborted) {
        throw new DOMException("The operation was aborted", "AbortError");
      }
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .map((item) => (typeof item.str === "string" ? item.str : ""))
          .filter(Boolean)
          .join(" "),
      );
    }
  } finally {
    await document.destroy();
  }
  return {
    text: relevantHtmlText(pages.join("\n").replace(/\s+/g, " ").trim()),
    pagesProcessed: pageCount,
  };
}

function hasCompatibleHtmlStructure(bytes: Uint8Array): boolean {
  const prefix = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.length, 16_384)));
  return /<!doctype\s+html\b|<html\b|<head\b|<body\b|<main\b|<article\b|<title\b/i.test(prefix);
}

async function readBytes(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<Uint8Array | null> {
  if (!body) {
    return new Uint8Array();
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function mappedStructuralFailure(result: SafeUrlFailure): Extract<DocumentFetchResult, { ok: false }> {
  return { ok: false, code: result.code, detail: result.detail };
}

function mapValidationFailureCode(code: string): DocumentFetchFailureCode {
  if (code === "TOO_LARGE") {
    return "DOCUMENT_TOO_LARGE";
  }
  if (
    code === "INVALID_URL" ||
    code === "BLOCKED_PROTOCOL" ||
    code === "BLOCKED_HOST" ||
    code === "BLOCKED_IP" ||
    code === "DNS_FAILED" ||
    code === "TIMEOUT" ||
    code === "HTTP_ERROR" ||
    code === "UNSUPPORTED_CONTENT_TYPE" ||
    code === "TOO_MANY_REDIRECTS" ||
    code === "NETWORK_ERROR"
  ) {
    return code;
  }
  return "NETWORK_ERROR";
}

export async function fetchWebDocument(
  rawUrl: string,
  deps: WebDocumentFetcherDeps,
): Promise<DocumentFetchResult> {
  if (deps.signal?.aborted) {
    return { ok: false, code: "TIMEOUT", detail: "Tiempo de espera agotado" };
  }
  const initial = assertSafePublicHttpUrl(rawUrl);
  if (!initial.ok) {
    return mappedStructuralFailure(initial);
  }

  let currentUrl = initial.url.toString();
  let robotsFromCache = false;

  for (let hop = 0; hop <= deps.maxRedirects; hop += 1) {
    if (deps.signal?.aborted) {
      return {
        ok: false,
        code: "TIMEOUT",
        detail: "Tiempo de espera agotado",
        finalUrl: currentUrl,
      };
    }
    const structural = assertSafePublicHttpUrl(currentUrl);
    if (!structural.ok) {
      return { ...mappedStructuralFailure(structural), finalUrl: currentUrl };
    }
    if (deps.urlPolicy && !deps.urlPolicy(currentUrl)) {
      return {
        ok: false,
        code: "BLOCKED_HOST",
        detail: "El destino no cumple la política de fuentes permitidas",
        finalUrl: currentUrl,
      };
    }
    const robots = await checkRobotsAllowed(currentUrl, {
      fetchImpl: deps.fetchImpl,
      requestImpl: deps.requestImpl,
      lookupImpl: deps.lookupImpl,
      timeoutMs: deps.timeoutMs,
      now: deps.now,
      userAgent: deps.userAgent,
      cacheTtlMs: deps.robotsCacheTtlMs,
      cache: deps.robotsCache,
      signal: deps.signal,
      maxBytes: deps.maxRobotsBytes,
      requestGate: deps.requestGate,
    });
    if (deps.signal?.aborted) {
      return {
        ok: false,
        code: "TIMEOUT",
        detail: "Tiempo de espera agotado",
        finalUrl: currentUrl,
      };
    }
    robotsFromCache = robots.fromCache;
    if (!robots.allowed) {
      if (robots.failureCode) {
        return {
          ok: false,
          code: mapValidationFailureCode(robots.failureCode),
          detail: "No fue posible validar de forma segura el host de robots.txt",
          finalUrl: currentUrl,
        };
      }
      return {
        ok: false,
        code:
          robots.reason === "ROBOTS_DISALLOWED"
            ? "ROBOTS_DISALLOWED"
            : "ROBOTS_UNAVAILABLE",
        detail:
          robots.reason === "ROBOTS_DISALLOWED"
            ? "robots.txt no permite recuperar esta ruta"
            : "No fue posible verificar robots.txt de forma segura",
        finalUrl: currentUrl,
      };
    }
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, deps.timeoutMs);
    const onAbort = () => controller.abort();
    deps.signal?.addEventListener("abort", onAbort, { once: true });
    if (deps.signal?.aborted) controller.abort();
    try {
      const request = () => requestPinnedPublicUrl(structural.url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml,application/pdf",
          "User-Agent": deps.userAgent,
        },
      }, deps);
      const requested = deps.requestGate
        ? await deps.requestGate(currentUrl, request)
        : await request();
      if (!requested.ok) {
        return {
          ok: false,
          code: mapValidationFailureCode(requested.failure.code),
          detail: requested.failure.detail,
          finalUrl: currentUrl,
        };
      }
      const response = requested.response;
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          return { ok: false, code: "HTTP_ERROR", detail: "Redirección sin destino", statusCode: response.status, finalUrl: currentUrl };
        }
        if (hop === deps.maxRedirects) {
          return { ok: false, code: "TOO_MANY_REDIRECTS", detail: "Demasiadas redirecciones", statusCode: response.status, finalUrl: currentUrl };
        }
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }
      if (!response.ok) {
        return { ok: false, code: "HTTP_ERROR", detail: `La fuente respondió HTTP ${response.status}`, statusCode: response.status, finalUrl: currentUrl };
      }
      const contentLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > deps.maxDocumentBytes) {
        await response.body?.cancel();
        return { ok: false, code: "DOCUMENT_TOO_LARGE", detail: "El documento supera el límite configurado", statusCode: response.status, finalUrl: currentUrl };
      }
      const bytes = await readBytes(response.body, deps.maxDocumentBytes);
      if (!bytes) {
        return { ok: false, code: "DOCUMENT_TOO_LARGE", detail: "El documento supera el límite configurado", statusCode: response.status, finalUrl: currentUrl };
      }
      const contentType = (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
      const signature = new TextDecoder("ascii").decode(bytes.slice(0, 5));
      const isPdf = contentType === "application/pdf";
      const isHtml = contentType === "text/html" || contentType === "application/xhtml+xml";
      const fetchedAt = (deps.now?.() ?? new Date()).toISOString();

      if (isPdf) {
        if (signature !== "%PDF-") {
          return { ok: false, code: "PDF_INVALID", detail: "La firma del PDF no es válida", finalUrl: currentUrl };
        }
        try {
          const parsed = await extractPdfText(
            bytes,
            deps.maxPdfPages,
            deps.loadPdfDocument,
            deps.signal,
          );
          if (!parsed.text) {
            return { ok: false, code: "PDF_NO_EXTRACTABLE_TEXT", detail: "El PDF no contiene texto extraíble", finalUrl: currentUrl };
          }
          return {
            ok: true,
            robotsFromCache,
            document: {
              requestedUrl: rawUrl,
              finalUrl: currentUrl,
              canonicalUrl: null,
              contentType: "application/pdf",
              statusCode: response.status,
              title: null,
              text: parsed.text,
              links: [],
              byteLength: bytes.byteLength,
              fetchedAt,
              pdfPagesProcessed: parsed.pagesProcessed,
            },
          };
        } catch (error) {
          return {
            ok: false,
            code: error instanceof Error && error.message === "PDF_INVALID" ? "PDF_INVALID" : "PDF_NO_EXTRACTABLE_TEXT",
            detail: "No fue posible extraer texto del PDF",
            finalUrl: currentUrl,
          };
        }
      }
      if (!isHtml) {
        return { ok: false, code: "UNSUPPORTED_CONTENT_TYPE", detail: `Tipo de contenido no permitido: ${contentType || "desconocido"}`, finalUrl: currentUrl };
      }
      if (!hasCompatibleHtmlStructure(bytes)) {
        return { ok: false, code: "UNSUPPORTED_CONTENT_TYPE", detail: "El contenido no presenta una estructura HTML válida", finalUrl: currentUrl };
      }
      const extracted = extractHtmlDocument(new TextDecoder().decode(bytes), currentUrl);
      return {
        ok: true,
        robotsFromCache,
        document: {
          requestedUrl: rawUrl,
          finalUrl: currentUrl,
          canonicalUrl: extracted.canonicalUrl,
          contentType,
          statusCode: response.status,
          title: extracted.title,
          text: extracted.text,
          links: extracted.links,
          byteLength: bytes.byteLength,
          fetchedAt,
          pdfPagesProcessed: 0,
        },
      };
    } catch {
      return {
        ok: false,
        code: timedOut || deps.signal?.aborted ? "TIMEOUT" : "NETWORK_ERROR",
        detail:
          timedOut || deps.signal?.aborted
            ? "Tiempo de espera agotado"
            : "No se pudo recuperar el documento",
        finalUrl: currentUrl,
      };
    } finally {
      clearTimeout(timer);
      deps.signal?.removeEventListener("abort", onAbort);
    }
  }
  return { ok: false, code: "TOO_MANY_REDIRECTS", detail: "Demasiadas redirecciones", finalUrl: currentUrl };
}
