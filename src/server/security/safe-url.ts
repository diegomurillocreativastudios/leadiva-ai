export type SafeUrlSuccess = {
  ok: true;
  url: URL;
};

export type SafeUrlFailure = {
  ok: false;
  code:
    | "INVALID_URL"
    | "BLOCKED_PROTOCOL"
    | "BLOCKED_HOST"
    | "BLOCKED_IP";
  detail: string;
};

export type SafeUrlResult = SafeUrlSuccess | SafeUrlFailure;

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
]);

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

export function isPrivateOrReservedIp(ip: string): boolean {
  const value = ip.trim().toLowerCase();

  if (value.includes(":")) {
    if (value === "::1" || value === "::") {
      return true;
    }
    if (value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80")) {
      return true;
    }
    // IPv4-mapped IPv6 ::ffff:x.x.x.x
    const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) {
      return isPrivateOrReservedIp(mapped[1]);
    }
    return false;
  }

  const parts = value.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return true;
  }

  const [a, b] = parts;
  if (a === undefined || b === undefined) {
    return true;
  }

  if (a === 0 || a === 10 || a === 127) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 100 && b >= 64 && b <= 127) {
    // Carrier-grade NAT
    return true;
  }
  if (
    (a === 192 && (b === 0 || b === 2)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0) ||
    a >= 224
  ) {
    // Documentation, benchmark, multicast, and reserved ranges.
    return true;
  }

  return false;
}

export function assertSafePublicHttpUrl(raw: string): SafeUrlResult {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return {
      ok: false,
      code: "INVALID_URL",
      detail: "URL inválida",
    };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      code: "BLOCKED_PROTOCOL",
      detail: "Solo se permiten URLs http/https",
    };
  }

  const hostname = normalizeHostname(url.hostname);
  if (
    !hostname ||
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return {
      ok: false,
      code: "BLOCKED_HOST",
      detail: "Host local o de metadatos bloqueado",
    };
  }

  // Literal IP in hostname
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(":")) {
    if (isPrivateOrReservedIp(hostname.replace(/^\[|\]$/g, ""))) {
      return {
        ok: false,
        code: "BLOCKED_IP",
        detail: "IP privada o reservada bloqueada",
      };
    }
  }

  return { ok: true, url };
}
