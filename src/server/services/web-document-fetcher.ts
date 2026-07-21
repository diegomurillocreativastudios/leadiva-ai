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
  | "PDF_PARSE_FAILED"
  | "PDF_PASSWORD_PROTECTED"
  | "PDF_TRUNCATED"
  | "PDF_UNSUPPORTED"
  | "PDF_INVALID_SIGNATURE"
  | "PDF_TOO_LARGE"
  | "UNSUPPORTED_CONTENT_ENCODING"
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
  titleSource?: "DOCUMENT_HEADING" | "HTML_TITLE" | null;
  text: string;
  links: string[];
  byteLength: number;
  fetchedAt: string;
  pdfPagesProcessed: number;
};

export const PDF_PARSER_STAGES = [
  "INPUT_VALIDATION",
  "OPEN_DOCUMENT",
  "LOAD_PAGE",
  "EXTRACT_TEXT",
  "DESTROY_DOCUMENT",
] as const;

export type PdfParserStage = (typeof PDF_PARSER_STAGES)[number];

export type PdfParserFailure = {
  exceptionName:
    | "AbortException"
    | "InvalidPDFException"
    | "PasswordException"
    | "UnknownErrorException"
    | "Error";
  exceptionCode:
    | "ABORTED"
    | "INVALID_DOCUMENT"
    | "PASSWORD_REQUIRED"
    | "UNSUPPORTED_DOCUMENT"
    | "UNEXPECTED_PARSER_ERROR";
  stage: PdfParserStage;
};

export type DocumentFetchResult =
  | { ok: true; document: FetchedDocument; robotsFromCache: boolean }
  | {
      ok: false;
      code: DocumentFetchFailureCode;
      detail: string;
      finalUrl?: string;
      statusCode?: number;
      parserFailure?: PdfParserFailure;
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
  urlPolicy?: (
    url: string,
  ) => boolean | { allowed: true } | { allowed: false; reason: string };
  signal?: AbortSignal;
  loadPdfDocument?: (
    bytes: Uint8Array,
    signal?: AbortSignal,
  ) => Promise<PdfDocumentLike>;
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

function isGenericExtractedTitle(value: string): boolean {
  const title = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .trim()
    .toLowerCase();
  return (
    title.length < 8 ||
    /^(?:pdf|documento|archivo|descarga|download|inicio|home|untitled|sin titulo|tdr|rfp|rfq)$/i.test(
      title,
    )
  );
}

export function extractHtmlDocument(html: string, finalUrl: string): {
  title: string | null;
  titleSource: "DOCUMENT_HEADING" | "HTML_TITLE" | null;
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
  const descriptiveHeading = heading && !isGenericExtractedTitle(heading);
  const title = descriptiveHeading ? heading : htmlTitle || heading || null;
  const titleSource = descriptiveHeading
    ? ("DOCUMENT_HEADING" as const)
    : htmlTitle
      ? ("HTML_TITLE" as const)
      : null;
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
  return { title, titleSource, text, links: [...new Set(links)], canonicalUrl };
}

export async function loadPdfDocumentWithPdfJs(
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<PdfDocumentLike> {
  // PDF.js loads these Node polyfills through an optional dynamic dependency,
  // which standalone tracing cannot discover unless the application imports it.
  if (
    typeof globalThis.DOMMatrix === "undefined" ||
    typeof globalThis.ImageData === "undefined" ||
    typeof globalThis.Path2D === "undefined"
  ) {
    const canvas = await import("@napi-rs/canvas");
    globalThis.DOMMatrix ??= canvas.DOMMatrix as unknown as typeof DOMMatrix;
    globalThis.ImageData ??= canvas.ImageData as unknown as typeof ImageData;
    globalThis.Path2D ??= canvas.Path2D as unknown as typeof Path2D;
  }
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
  const abort = () => {
    void task.destroy().catch(() => undefined);
  };
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  let document;
  try {
    document = await task.promise;
  } catch (error) {
    await task.destroy().catch(() => undefined);
    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
  }
  return {
    numPages: document.numPages,
    getPage: (pageNumber) => document.getPage(pageNumber),
    destroy: () => task.destroy(),
  } as PdfDocumentLike;
}

type PdfBinaryInput = Uint8Array | ArrayBuffer;

/** PDF.js rejects Node Buffers and takes ownership of the supplied buffer. */
export function toPdfUint8Array(input: PdfBinaryInput): Uint8Array {
  const source = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  return Uint8Array.from(source);
}

function pdfExceptionName(error: unknown): PdfParserFailure["exceptionName"] {
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? (error as { name?: unknown }).name
      : null;
  return name === "AbortException" ||
    name === "InvalidPDFException" ||
    name === "PasswordException" ||
    name === "UnknownErrorException"
    ? name
    : "Error";
}

export function classifyPdfParserFailure(
  error: unknown,
  stage: PdfParserStage,
): { code: DocumentFetchFailureCode; diagnostics: PdfParserFailure } {
  const exceptionName = pdfExceptionName(error);
  const numericCode =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : null;
  if (
    exceptionName === "PasswordException" ||
    numericCode === 1 ||
    numericCode === 2
  ) {
    return {
      code: "PDF_PASSWORD_PROTECTED",
      diagnostics: {
        exceptionName: "PasswordException",
        exceptionCode: "PASSWORD_REQUIRED",
        stage,
      },
    };
  }
  if (exceptionName === "AbortException" || exceptionName === "Error" && (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  )) {
    return {
      code: "TIMEOUT",
      diagnostics: {
        exceptionName: "AbortException",
        exceptionCode: "ABORTED",
        stage,
      },
    };
  }
  if (exceptionName === "UnknownErrorException") {
    return {
      code: "PDF_UNSUPPORTED",
      diagnostics: {
        exceptionName,
        exceptionCode: "UNSUPPORTED_DOCUMENT",
        stage,
      },
    };
  }
  if (exceptionName === "InvalidPDFException") {
    return {
      code: "PDF_PARSE_FAILED",
      diagnostics: {
        exceptionName,
        exceptionCode: "INVALID_DOCUMENT",
        stage,
      },
    };
  }
  return {
    code: "PDF_PARSE_FAILED",
    diagnostics: {
      exceptionName,
      exceptionCode: "UNEXPECTED_PARSER_ERROR",
      stage,
    },
  };
}

async function racePdfOperation<T>(
  operation: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return operation;
  if (signal.aborted) {
    throw new DOMException("The operation was aborted", "AbortError");
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () =>
      reject(new DOMException("The operation was aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    operation.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", abort);
    });
  });
}

export async function extractPdfText(
  input: PdfBinaryInput,
  maxPages: number,
  loadPdfDocument: (
    bytes: Uint8Array,
    signal?: AbortSignal,
  ) => Promise<PdfDocumentLike> =
    loadPdfDocumentWithPdfJs,
  signal?: AbortSignal,
): Promise<{ text: string; pagesProcessed: number }> {
  const bytes = toPdfUint8Array(input);
  const signature = new TextDecoder("ascii").decode(bytes.slice(0, 5));
  if (signature !== "%PDF-") {
    const error = new Error("PDF_INVALID_SIGNATURE");
    error.name = "InvalidPDFException";
    throw error;
  }
  let stage: PdfParserStage = "OPEN_DOCUMENT";
  let document: PdfDocumentLike | null = null;
  let failure: ReturnType<typeof classifyPdfParserFailure> | null = null;
  let pageCount = 0;
  const pages: string[] = [];
  try {
    document = await racePdfOperation(loadPdfDocument(bytes, signal), signal);
    pageCount = Math.min(document.numPages, maxPages);
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      if (signal?.aborted) {
        throw new DOMException("The operation was aborted", "AbortError");
      }
      stage = "LOAD_PAGE";
      const page = await racePdfOperation(document.getPage(pageNumber), signal);
      stage = "EXTRACT_TEXT";
      const content = await racePdfOperation(page.getTextContent(), signal);
      pages.push(
        content.items
          .map((item) => (typeof item.str === "string" ? item.str : ""))
          .filter(Boolean)
          .join(" "),
      );
    }
  } catch (error) {
    failure = classifyPdfParserFailure(error, stage);
  }
  if (document) {
    try {
      await document.destroy();
    } catch (error) {
      failure ??= classifyPdfParserFailure(error, "DESTROY_DOCUMENT");
    }
  }
  if (failure) {
    const error = new Error(failure.code) as Error & {
      parserFailure?: PdfParserFailure;
    };
    error.name = "PdfParserError";
    error.parserFailure = failure.diagnostics;
    throw error;
  }
  return {
    text: relevantHtmlText(pages.join("\n").replace(/\s+/g, " ").trim()),
    pagesProcessed: pageCount,
  };
}

function hasPdfEofMarker(bytes: Uint8Array): boolean {
  const start = Math.max(0, bytes.byteLength - 2_048);
  return new TextDecoder("ascii").decode(bytes.slice(start)).includes("%%EOF");
}

function contentLength(headers: Headers): number | null {
  const raw = headers.get("content-length");
  if (raw === null || !/^\d+$/.test(raw.trim())) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
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
    if (deps.urlPolicy) {
      const policy = deps.urlPolicy(currentUrl);
      const allowed = typeof policy === "boolean" ? policy : policy.allowed;
      if (!allowed) {
        const reason =
          typeof policy === "object" && "reason" in policy
            ? policy.reason.replace(/[^A-Z0-9_]/g, "").slice(0, 80)
            : "UNSPECIFIED";
        return {
          ok: false,
          code: "BLOCKED_HOST",
          detail: `Política de fuente bloqueó el destino: ${reason}`,
          finalUrl: currentUrl,
        };
      }
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
          "Accept-Encoding": "identity",
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
      const contentType = (response.headers.get("content-type") ?? "")
        .split(";")[0]
        ?.trim()
        .toLowerCase() ?? "";
      const isPdf = contentType === "application/pdf";
      const responseContentLength = contentLength(response.headers);
      if (
        responseContentLength !== null &&
        responseContentLength > deps.maxDocumentBytes
      ) {
        await response.body?.cancel();
        return {
          ok: false,
          code: isPdf ? "PDF_TOO_LARGE" : "DOCUMENT_TOO_LARGE",
          detail: isPdf
            ? "El PDF supera el límite configurado"
            : "El documento supera el límite configurado",
          statusCode: response.status,
          finalUrl: currentUrl,
        };
      }
      const bytes = await readBytes(response.body, deps.maxDocumentBytes);
      if (!bytes) {
        return {
          ok: false,
          code: isPdf ? "PDF_TOO_LARGE" : "DOCUMENT_TOO_LARGE",
          detail: isPdf
            ? "El PDF supera el límite configurado"
            : "El documento supera el límite configurado",
          statusCode: response.status,
          finalUrl: currentUrl,
        };
      }
      const contentEncoding = (
        response.headers.get("content-encoding") ?? "identity"
      ).toLowerCase();
      if (contentEncoding !== "identity") {
        return {
          ok: false,
          code: "UNSUPPORTED_CONTENT_ENCODING",
          detail: "La fuente ignoró la codificación de transferencia solicitada",
          statusCode: response.status,
          finalUrl: currentUrl,
        };
      }
      if (
        responseContentLength !== null &&
        responseContentLength !== bytes.byteLength
      ) {
        return {
          ok: false,
          code: isPdf ? "PDF_TRUNCATED" : "NETWORK_ERROR",
          detail: isPdf
            ? "La descarga del PDF quedó incompleta"
            : "La descarga del documento quedó incompleta",
          statusCode: response.status,
          finalUrl: currentUrl,
        };
      }
      const signature = new TextDecoder("ascii").decode(bytes.slice(0, 5));
      const isHtml = contentType === "text/html" || contentType === "application/xhtml+xml";
      const fetchedAt = (deps.now?.() ?? new Date()).toISOString();

      if (isPdf) {
        if (signature !== "%PDF-") {
          return { ok: false, code: "PDF_INVALID_SIGNATURE", detail: "La firma del PDF no es válida", finalUrl: currentUrl };
        }
        if (!hasPdfEofMarker(bytes)) {
          return {
            ok: false,
            code: "PDF_TRUNCATED",
            detail: "El PDF no contiene un cierre completo",
            statusCode: response.status,
            finalUrl: currentUrl,
          };
        }
        try {
          const parsed = await extractPdfText(
            bytes,
            deps.maxPdfPages,
            deps.loadPdfDocument,
            controller.signal,
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
              titleSource: null,
              text: parsed.text,
              links: [],
              byteLength: bytes.byteLength,
              fetchedAt,
              pdfPagesProcessed: parsed.pagesProcessed,
            },
          };
        } catch (error) {
          const parserFailure =
            error instanceof Error && "parserFailure" in error
              ? (error as { parserFailure?: PdfParserFailure }).parserFailure
              : undefined;
          const code =
            error instanceof Error &&
            (error.message === "PDF_INVALID_SIGNATURE" ||
              error.message === "PDF_PASSWORD_PROTECTED" ||
              error.message === "PDF_TRUNCATED" ||
              error.message === "PDF_UNSUPPORTED" ||
              error.message === "TIMEOUT")
              ? (error.message as DocumentFetchFailureCode)
              : "PDF_PARSE_FAILED";
          return {
            ok: false,
            code,
            detail:
              code === "PDF_INVALID_SIGNATURE"
                ? "La firma del PDF no es válida"
                : code === "PDF_PASSWORD_PROTECTED"
                  ? "El PDF requiere contraseña"
                  : code === "PDF_UNSUPPORTED"
                    ? "El PDF usa una estructura no compatible"
                    : code === "TIMEOUT"
                      ? "Tiempo de espera agotado"
                      : "No fue posible procesar el PDF",
            finalUrl: currentUrl,
            ...(parserFailure ? { parserFailure } : {}),
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
          titleSource: extracted.titleSource,
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
