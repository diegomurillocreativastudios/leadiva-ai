import { groundedCandidateSchema, type GroundedCandidate } from "./schemas";

const WORK_MODE_MAP: Record<string, GroundedCandidate["workMode"]> = {
  onsite: "ONSITE",
  presencial: "ONSITE",
  "on-site": "ONSITE",
  remote: "REMOTE",
  remoto: "REMOTE",
  hybrid: "HYBRID",
  hibrido: "HYBRID",
  híbrido: "HYBRID",
  unknown: "UNKNOWN",
  desconocido: "UNKNOWN",
  n_a: "UNKNOWN",
  na: "UNKNOWN",
  "n/a": "UNKNOWN",
};

const CATEGORY_MAP: Record<string, NonNullable<GroundedCandidate["category"]>> = {
  software: "SOFTWARE",
  it: "IT",
  consulting: "CONSULTING",
  consultoria: "CONSULTING",
  consultoría: "CONSULTING",
  ai: "AI",
  ia: "AI",
  other: "OTHER",
  otro: "OTHER",
};

const SECTOR_MAP: Record<
  string,
  NonNullable<GroundedCandidate["contractingSector"]>
> = {
  public: "PUBLIC",
  público: "PUBLIC",
  publico: "PUBLIC",
  government: "PUBLIC",
  private: "PRIVATE",
  privado: "PRIVATE",
  corporate: "PRIVATE",
  unknown: "UNKNOWN",
};

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeWorkMode(
  value: unknown,
): GroundedCandidate["workMode"] {
  if (value === null || value === undefined || value === "") {
    return "UNKNOWN";
  }
  if (typeof value !== "string") {
    return "UNKNOWN";
  }
  const key = value.trim().toLowerCase();
  return WORK_MODE_MAP[key] ?? "UNKNOWN";
}

function normalizeCategory(
  value: unknown,
): GroundedCandidate["category"] {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const key = value.trim().toLowerCase();
  return CATEGORY_MAP[key] ?? null;
}

function normalizeSector(
  value: unknown,
): GroundedCandidate["contractingSector"] {
  if (value === null || value === undefined || value === "") {
    return "UNKNOWN";
  }
  if (typeof value !== "string") {
    return "UNKNOWN";
  }
  const key = value.trim().toLowerCase();
  return SECTOR_MAP[key] ?? "UNKNOWN";
}

function normalizeAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d.]/g, "");
    if (!cleaned) {
      return null;
    }
    const parsed = Number.parseFloat(cleaned);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return null;
}

function normalizeCurrency(value: unknown): string | null {
  const text = asTrimmedString(value);
  if (!text) {
    return null;
  }
  const upper = text.toUpperCase();
  if (upper.length === 3) {
    return upper;
  }
  if (upper.includes("USD") || upper.includes("$")) {
    return "USD";
  }
  return null;
}

function normalizeDeadline(value: unknown): string | null {
  const text = asTrimmedString(value);
  if (!text) {
    return null;
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

/**
 * Coerces a single model candidate into our schema. Returns null when the
 * candidate cannot be salvaged (missing title/url).
 */
export function sanitizeGroundedCandidate(
  raw: unknown,
): GroundedCandidate | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const title = asTrimmedString(record.title);
  const sourceUrl = asTrimmedString(record.sourceUrl ?? record.url);
  if (!title || title.length < 3 || !sourceUrl) {
    return null;
  }

  const amount = normalizeAmount(record.estimatedAmount);
  const candidate = {
    title: title.slice(0, 500),
    organizationName: asTrimmedString(record.organizationName)?.slice(0, 250) ?? null,
    sourceUrl,
    snippet: asTrimmedString(record.snippet)?.slice(0, 2000) ?? null,
    category: normalizeCategory(record.category),
    countryCode: asTrimmedString(record.countryCode)?.slice(0, 2).toUpperCase() ?? null,
    workMode: normalizeWorkMode(record.workMode),
    contractingSector: normalizeSector(record.contractingSector),
    estimatedAmount: amount,
    currency: amount ? normalizeCurrency(record.currency) ?? "USD" : normalizeCurrency(record.currency),
    deadlineAt: normalizeDeadline(record.deadlineAt),
  };

  const parsed = groundedCandidateSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function sanitizeGroundedCandidates(
  rawCandidates: unknown[],
  maxCandidates: number,
): GroundedCandidate[] {
  const accepted: GroundedCandidate[] = [];
  const seen = new Set<string>();

  for (const raw of rawCandidates) {
    if (accepted.length >= maxCandidates) {
      break;
    }
    const candidate = sanitizeGroundedCandidate(raw);
    if (!candidate) {
      continue;
    }
    const key = candidate.sourceUrl.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    accepted.push(candidate);
  }

  return accepted;
}

export function sanitizeSearchQueries(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value.length <= 500)
    .slice(0, 50);
}
