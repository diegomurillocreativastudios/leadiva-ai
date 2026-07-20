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

type ParsedIpAddress = {
  family: 4 | 6;
  bytes: Uint8Array;
};

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

function parseIpv4(raw: string): Uint8Array | null {
  const parts = raw.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const bytes = new Uint8Array(4);
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (!part || !/^\d{1,3}$/.test(part)) {
      return null;
    }
    const value = Number(part);
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      return null;
    }
    bytes[index] = value;
  }
  return bytes;
}

function parseIpv6(raw: string): Uint8Array | null {
  let value = raw.toLowerCase().replace(/^\[|\]$/g, "");
  if (value.includes("%") || !/^[0-9a-f:.]+$/.test(value)) {
    return null;
  }

  if (value.includes(".")) {
    const separator = value.lastIndexOf(":");
    if (separator < 0) {
      return null;
    }
    const ipv4 = parseIpv4(value.slice(separator + 1));
    if (!ipv4) {
      return null;
    }
    const high = ((ipv4[0] ?? 0) << 8) | (ipv4[1] ?? 0);
    const low = ((ipv4[2] ?? 0) << 8) | (ipv4[3] ?? 0);
    value = `${value.slice(0, separator)}:${high.toString(16)}:${low.toString(16)}`;
  }

  if ((value.match(/::/g) ?? []).length > 1) {
    return null;
  }
  const hasCompression = value.includes("::");
  const [leftRaw, rightRaw = ""] = value.split("::");
  const left = leftRaw ? leftRaw.split(":") : [];
  const right = hasCompression && rightRaw ? rightRaw.split(":") : [];
  const all = [...left, ...right];
  if (
    all.some((part) => !/^[0-9a-f]{1,4}$/.test(part)) ||
    (!hasCompression && all.length !== 8) ||
    (hasCompression && all.length >= 8)
  ) {
    return null;
  }
  const missing = hasCompression ? 8 - all.length : 0;
  const groups = [
    ...left,
    ...Array.from({ length: missing }, () => "0"),
    ...right,
  ];
  if (groups.length !== 8) {
    return null;
  }
  const bytes = new Uint8Array(16);
  for (let index = 0; index < groups.length; index += 1) {
    const group = Number.parseInt(groups[index] ?? "", 16);
    if (!Number.isFinite(group)) {
      return null;
    }
    bytes[index * 2] = group >> 8;
    bytes[index * 2 + 1] = group & 0xff;
  }
  return bytes;
}

export function parseIpAddress(raw: string): ParsedIpAddress | null {
  const value = raw.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const ipv4 = parseIpv4(value);
  if (ipv4) {
    return { family: 4, bytes: ipv4 };
  }
  const ipv6 = parseIpv6(value);
  return ipv6 ? { family: 6, bytes: ipv6 } : null;
}

function matchesPrefix(
  bytes: Uint8Array,
  prefix: readonly number[],
  prefixLength: number,
): boolean {
  const wholeBytes = Math.floor(prefixLength / 8);
  const remainingBits = prefixLength % 8;
  for (let index = 0; index < wholeBytes; index += 1) {
    if (bytes[index] !== prefix[index]) {
      return false;
    }
  }
  if (remainingBits === 0) {
    return true;
  }
  const mask = (0xff << (8 - remainingBits)) & 0xff;
  return ((bytes[wholeBytes] ?? 0) & mask) === ((prefix[wholeBytes] ?? 0) & mask);
}

const BLOCKED_IPV4_PREFIXES: ReadonlyArray<readonly [readonly number[], number]> = [
  [[0], 8],
  [[10], 8],
  [[100, 64], 10],
  [[127], 8],
  [[169, 254], 16],
  [[172, 16], 12],
  [[192, 0, 0], 24],
  [[192, 0, 2], 24],
  [[192, 168], 16],
  [[198, 18], 15],
  [[198, 51, 100], 24],
  [[203, 0, 113], 24],
  [[224], 4],
  [[240], 4],
];

const BLOCKED_IPV6_PREFIXES: ReadonlyArray<readonly [readonly number[], number]> = [
  // Unspecified, loopback, IPv4-compatible, mapped and translated forms.
  [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 96],
  [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff], 96],
  [[0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff, 0, 0], 96],
  // NAT64 well-known/local-use, discard, IETF special-use, 6to4 and docs.
  [[0x00, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0], 96],
  [[0x00, 0x64, 0xff, 0x9b, 0x00, 0x01], 48],
  [[0x01, 0x00, 0, 0, 0, 0, 0, 0], 64],
  [[0x20, 0x01], 23],
  [[0x20, 0x01, 0x0d, 0xb8], 32],
  [[0x20, 0x02], 16],
  [[0x3f, 0xff], 20],
  [[0x5f, 0x00], 16],
  // Unique-local, link/site-local, multicast and future reserved space.
  [[0xfc], 7],
  [[0xfe, 0x80], 10],
  [[0xfe, 0xc0], 10],
  [[0xff], 8],
];

export function isPrivateOrReservedIp(ip: string): boolean {
  const parsed = parseIpAddress(ip);
  if (!parsed) {
    return true;
  }
  const prefixes =
    parsed.family === 4 ? BLOCKED_IPV4_PREFIXES : BLOCKED_IPV6_PREFIXES;
  return prefixes.some(([prefix, length]) =>
    matchesPrefix(parsed.bytes, prefix, length),
  );
}

export function assertSafePublicHttpUrl(raw: string): SafeUrlResult {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, code: "INVALID_URL", detail: "URL inválida" };
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

  if (parseIpAddress(hostname) && isPrivateOrReservedIp(hostname)) {
    return {
      ok: false,
      code: "BLOCKED_IP",
      detail: "IP privada o reservada bloqueada",
    };
  }

  return { ok: true, url };
}
