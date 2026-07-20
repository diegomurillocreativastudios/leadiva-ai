import { lookup as dnsLookup } from "node:dns/promises";

import {
  nodePinnedHttpRequest,
  type PinnedHttpRequest,
  type PinnedRequestInit,
  type PublicAddress,
} from "@/server/security/pinned-http-client";
import {
  assertSafePublicHttpUrl,
  isPrivateOrReservedIp,
  parseIpAddress,
} from "@/server/security/safe-url";

export type SourceUrlValidationCode =
  | "INVALID_URL"
  | "BLOCKED_PROTOCOL"
  | "BLOCKED_HOST"
  | "BLOCKED_IP"
  | "DNS_FAILED"
  | "TIMEOUT"
  | "HTTP_ERROR"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "TOO_LARGE"
  | "TOO_MANY_REDIRECTS"
  | "NETWORK_ERROR";

export type SourceUrlValidationSuccess = {
  ok: true;
  checkedAt: string;
  finalUrl: string;
  statusCode: number;
  redirectCount: number;
  contentType: string | null;
};

export type SourceUrlValidationFailure = {
  ok: false;
  checkedAt: string;
  code: SourceUrlValidationCode;
  detail: string;
  statusCode?: number;
  finalUrl?: string;
};

export type SourceUrlValidationResult =
  | SourceUrlValidationSuccess
  | SourceUrlValidationFailure;

export type SourceUrlValidationDeps = {
  /** Test-only compatibility adapter. Production uses requestImpl/default pinning. */
  fetchImpl?: typeof fetch;
  requestImpl?: PinnedHttpRequest;
  lookupImpl?: (
    hostname: string,
  ) => Promise<Array<{ address: string; family: number }>>;
  timeoutMs?: number;
  maxRedirects?: number;
  maxResponseBytes?: number;
  now?: () => Date;
};

export type HostRequestGate = <T>(
  rawUrl: string,
  task: () => Promise<T>,
) => Promise<T>;

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_MAX_RESPONSE_BYTES = 1_500_000;

export function allowedSourceContentType(contentType: string | null): boolean {
  if (!contentType) {
    return false;
  }
  const normalized = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return (
    normalized === "text/html" ||
    normalized === "application/xhtml+xml" ||
    normalized === "application/pdf"
  );
}

export type PublicHostResolution =
  | { ok: true; addresses: PublicAddress[] }
  | { ok: false; failure: SourceUrlValidationFailure };

export async function resolvePublicHost(
  hostname: string,
  lookupImpl: NonNullable<SourceUrlValidationDeps["lookupImpl"]>,
): Promise<PublicHostResolution> {
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookupImpl(hostname);
  } catch {
    return {
      ok: false,
      failure: {
        ok: false,
        checkedAt: new Date().toISOString(),
        code: "DNS_FAILED",
        detail: "No se pudo resolver el dominio de la convocatoria",
      },
    };
  }
  if (!addresses.length) {
    return {
      ok: false,
      failure: {
        ok: false,
        checkedAt: new Date().toISOString(),
        code: "DNS_FAILED",
        detail: "El dominio de la convocatoria no tiene registros DNS",
      },
    };
  }

  const validated: PublicAddress[] = [];
  for (const entry of addresses) {
    const parsed = parseIpAddress(entry.address);
    if (
      !parsed ||
      parsed.family !== entry.family ||
      isPrivateOrReservedIp(entry.address)
    ) {
      return {
        ok: false,
        failure: {
          ok: false,
          checkedAt: new Date().toISOString(),
          code: "BLOCKED_IP",
          detail: "El dominio resuelve a una IP no pública",
        },
      };
    }
    validated.push({ address: entry.address, family: parsed.family });
  }
  return { ok: true, addresses: validated };
}

export async function resolveAndAssertPublicHost(
  hostname: string,
  lookupImpl: NonNullable<SourceUrlValidationDeps["lookupImpl"]>,
): Promise<SourceUrlValidationFailure | null> {
  const result = await resolvePublicHost(hostname, lookupImpl);
  return result.ok ? null : result.failure;
}

export async function defaultPublicHostLookup(
  hostname: string,
): Promise<Array<{ address: string; family: number }>> {
  const result = await dnsLookup(hostname, { all: true });
  return result.map((entry) => ({
    address: entry.address,
    family: entry.family,
  }));
}

function testFetchRequest(fetchImpl: typeof fetch): PinnedHttpRequest {
  return async (url, init) =>
    fetchImpl(url, {
      method: init.method,
      redirect: "manual",
      credentials: "omit",
      signal: init.signal,
      headers: init.headers,
    });
}

export type PublicPinnedRequestDeps = Pick<
  SourceUrlValidationDeps,
  "lookupImpl" | "requestImpl" | "fetchImpl"
>;

export async function requestPinnedPublicUrl(
  url: URL,
  init: PinnedRequestInit,
  deps: PublicPinnedRequestDeps,
): Promise<
  | { ok: true; response: Response; address: PublicAddress }
  | { ok: false; failure: SourceUrlValidationFailure }
> {
  const resolution = await resolvePublicHost(
    url.hostname,
    deps.lookupImpl ?? defaultPublicHostLookup,
  );
  if (!resolution.ok) {
    return resolution;
  }
  const address = resolution.addresses[0];
  if (!address) {
    return {
      ok: false,
      failure: failure("DNS_FAILED", "El dominio no tiene una IP pública"),
    };
  }
  const requestImpl =
    deps.requestImpl ??
    (deps.fetchImpl ? testFetchRequest(deps.fetchImpl) : nodePinnedHttpRequest);
  try {
    return { ok: true, response: await requestImpl(url, init, address), address };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, failure: failure("TIMEOUT", "Tiempo de espera agotado") };
    }
    return {
      ok: false,
      failure: failure("NETWORK_ERROR", "No se pudo contactar la fuente"),
    };
  }
}

function failure(
  code: SourceUrlValidationCode,
  detail: string,
  extras?: Partial<SourceUrlValidationFailure>,
  now: () => Date = () => new Date(),
): SourceUrlValidationFailure {
  return {
    ok: false,
    checkedAt: now().toISOString(),
    code,
    detail,
    ...extras,
  };
}

/**
 * Validates that a convocatoria URL is public http(s), DNS-safe (no SSRF),
 * and reachable with a successful HTTP response before Leadiva exposes it.
 */
export async function validateSourceUrl(
  rawUrl: string,
  deps: SourceUrlValidationDeps = {},
): Promise<SourceUrlValidationResult> {
  const lookupImpl = deps.lookupImpl ?? defaultPublicHostLookup;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = deps.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const maxResponseBytes = deps.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const now = deps.now ?? (() => new Date());

  const structural = assertSafePublicHttpUrl(rawUrl);
  if (!structural.ok) {
    return failure(structural.code, structural.detail, undefined, now);
  }

  let currentUrl = structural.url.toString();
  let redirectCount = 0;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const parsed = assertSafePublicHttpUrl(currentUrl);
    if (!parsed.ok) {
      return failure(parsed.code, parsed.detail, { finalUrl: currentUrl }, now);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let requested = await requestPinnedPublicUrl(parsed.url, {
        method: "HEAD",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/pdf,application/xhtml+xml,*/*",
          "User-Agent": "LeadivaSourceValidator/1.0",
        },
      }, { ...deps, lookupImpl });
      if (!requested.ok) {
        return { ...requested.failure, checkedAt: now().toISOString(), finalUrl: currentUrl };
      }
      let response = requested.response;

      if (response.status === 405 || response.status === 501) {
        requested = await requestPinnedPublicUrl(parsed.url, {
          method: "GET",
          signal: controller.signal,
          headers: {
            Accept: "text/html,application/pdf,application/xhtml+xml,*/*",
            "User-Agent": "LeadivaSourceValidator/1.0",
            Range: "bytes=0-0",
          },
        }, { ...deps, lookupImpl });
        if (!requested.ok) {
          return { ...requested.failure, checkedAt: now().toISOString(), finalUrl: currentUrl };
        }
        response = requested.response;
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          return failure(
            "HTTP_ERROR",
            "Redirección sin destino",
            { statusCode: response.status, finalUrl: currentUrl },
            now,
          );
        }
        if (hop === maxRedirects) {
          return failure(
            "TOO_MANY_REDIRECTS",
            "Demasiadas redirecciones al validar la convocatoria",
            { statusCode: response.status, finalUrl: currentUrl },
            now,
          );
        }
        currentUrl = new URL(location, currentUrl).toString();
        redirectCount += 1;
        continue;
      }

      if (response.status < 200 || response.status >= 400) {
        return failure(
          "HTTP_ERROR",
          `La convocatoria respondió HTTP ${response.status}`,
          { statusCode: response.status, finalUrl: currentUrl },
          now,
        );
      }

      const contentType = response.headers.get("content-type");
      if (!allowedSourceContentType(contentType)) {
        return failure(
          "UNSUPPORTED_CONTENT_TYPE",
          "La URL no contiene HTML ni PDF verificable",
          { statusCode: response.status, finalUrl: currentUrl },
          now,
        );
      }

      const contentLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
        return failure(
          "TOO_LARGE",
          "La fuente supera el tamaño máximo de verificación",
          { statusCode: response.status, finalUrl: currentUrl },
          now,
        );
      }

      // Drain/cancel body for GET fallbacks to avoid downloading full documents.
      try {
        await response.body?.cancel();
      } catch {
        // ignore
      }

      return {
        ok: true,
        checkedAt: now().toISOString(),
        finalUrl: currentUrl,
        statusCode: response.status,
        redirectCount,
        contentType,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return failure(
          "TIMEOUT",
          "Tiempo de espera agotado al validar la convocatoria",
          { finalUrl: currentUrl },
          now,
        );
      }
      return failure(
        "NETWORK_ERROR",
        "No se pudo contactar la URL de la convocatoria",
        { finalUrl: currentUrl },
        now,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  return failure(
    "TOO_MANY_REDIRECTS",
    "Demasiadas redirecciones al validar la convocatoria",
    { finalUrl: currentUrl },
    now,
  );
}

export type SourceContentSuccess = SourceUrlValidationSuccess & {
  content: string | null;
  bytesRead: number;
};

export type SourceContentResult = SourceContentSuccess | SourceUrlValidationFailure;

async function readBodyWithLimit(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<{ content: string; bytesRead: number } | null> {
  if (!body) {
    return { content: "", bytesRead: 0 };
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { content: new TextDecoder().decode(merged), bytesRead };
}

/**
 * Retrieves bounded HTML after URL validation. PDFs remain eligible for
 * urlContext verification but are not decoded as text locally.
 */
export async function retrieveSourceContent(
  rawUrl: string,
  deps: SourceUrlValidationDeps = {},
): Promise<SourceContentResult> {
  const validation = await validateSourceUrl(rawUrl, deps);
  if (!validation.ok) {
    return validation;
  }

  const lookupImpl = deps.lookupImpl ?? defaultPublicHostLookup;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxResponseBytes = deps.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const now = deps.now ?? (() => new Date());
  const parsed = assertSafePublicHttpUrl(validation.finalUrl);
  if (!parsed.ok) {
    return failure(parsed.code, parsed.detail, { finalUrl: validation.finalUrl }, now);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const requested = await requestPinnedPublicUrl(parsed.url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/pdf,application/xhtml+xml",
        "User-Agent": "LeadivaSourceVerifier/1.0",
      },
    }, { ...deps, lookupImpl });
    if (!requested.ok) {
      return { ...requested.failure, checkedAt: now().toISOString(), finalUrl: validation.finalUrl };
    }
    const response = requested.response;

    if (response.status >= 300 && response.status < 400) {
      return failure(
        "HTTP_ERROR",
        "La URL cambió durante la recuperación de contenido",
        { statusCode: response.status, finalUrl: validation.finalUrl },
        now,
      );
    }
    if (response.status < 200 || response.status >= 400) {
      return failure(
        "HTTP_ERROR",
        `La convocatoria respondió HTTP ${response.status}`,
        { statusCode: response.status, finalUrl: validation.finalUrl },
        now,
      );
    }

    const contentType = response.headers.get("content-type") ?? validation.contentType;
    if (!allowedSourceContentType(contentType)) {
      return failure(
        "UNSUPPORTED_CONTENT_TYPE",
        "La URL no contiene HTML ni PDF verificable",
        { statusCode: response.status, finalUrl: validation.finalUrl },
        now,
      );
    }
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
      return failure(
        "TOO_LARGE",
        "La fuente supera el tamaño máximo de verificación",
        { statusCode: response.status, finalUrl: validation.finalUrl },
        now,
      );
    }

    if (contentType?.toLowerCase().includes("application/pdf")) {
      try {
        await response.body?.cancel();
      } catch {
        // Best effort only.
      }
      return { ...validation, contentType, content: null, bytesRead: 0 };
    }

    const body = await readBodyWithLimit(response.body, maxResponseBytes);
    if (!body) {
      return failure(
        "TOO_LARGE",
        "La fuente supera el tamaño máximo de verificación",
        { statusCode: response.status, finalUrl: validation.finalUrl },
        now,
      );
    }
    return { ...validation, contentType, ...body };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return failure("TIMEOUT", "Tiempo de espera agotado al recuperar la fuente", { finalUrl: validation.finalUrl }, now);
    }
    return failure("NETWORK_ERROR", "No se pudo recuperar el contenido de la fuente", { finalUrl: validation.finalUrl }, now);
  } finally {
    clearTimeout(timer);
  }
}

export function isSourceUrlValidated(
  rawData: Record<string, unknown> | null | undefined,
): boolean {
  const validation = rawData?.sourceUrlValidation;
  if (!validation || typeof validation !== "object") {
    return false;
  }
  return (validation as { ok?: unknown }).ok === true;
}
