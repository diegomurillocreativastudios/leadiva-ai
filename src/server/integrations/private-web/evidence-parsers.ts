export type OpportunityRole = "BUYER" | "SELLER" | "AMBIGUOUS";

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const STOPWORDS = new Set([
  "a", "al", "con", "de", "del", "el", "en", "la", "las", "lo", "los",
  "para", "por", "un", "una", "y", "the", "of", "for",
]);
const GENERIC_QUERY_TOKENS = new Set([
  "digital", "digitales", "servicio", "servicios", "tecnologia", "tecnologico",
]);

export function tokenizePrivateWebQuery(value: string): string[] {
  return [
    ...new Set(
      normalizeSearchText(value)
        .match(/[\p{L}\p{N}+#]+/gu)
        ?.filter((token) => !STOPWORDS.has(token) && (token.length >= 2 || token === "ia")) ?? [],
    ),
  ];
}

function tokenSet(value: string): Set<string> {
  return new Set(normalizeSearchText(value).match(/[\p{L}\p{N}+#]+/gu) ?? []);
}

export function evaluateQueryRelation(input: {
  query: string;
  title: string | null;
  scope: string;
  documentText: string;
  minCoverage: number;
}): { related: boolean; coverage: number; matched: string[] } {
  const queryTokens = tokenizePrivateWebQuery(input.query);
  if (queryTokens.length === 0) return { related: false, coverage: 0, matched: [] };
  const allTokens = tokenSet(`${input.title ?? ""} ${input.documentText}`);
  const titleScopeTokens = tokenSet(`${input.title ?? ""} ${input.scope}`);
  const matched = queryTokens.filter((token) => {
    if (allTokens.has(token)) return true;
    if (token === "ia") {
      const normalized = normalizeSearchText(input.documentText);
      return /\binteligencia artificial\b|\bmachine learning\b/.test(normalized);
    }
    if (token === "api") {
      return /\binterfaz(?:es)? de programacion de aplicaciones\b/.test(
        normalizeSearchText(input.documentText),
      );
    }
    return false;
  });
  const coverage = matched.length / queryTokens.length;
  const specificTokens = queryTokens.filter((token) => !GENERIC_QUERY_TOKENS.has(token));
  const normalizedTitleScopeText = normalizeSearchText(`${input.title ?? ""} ${input.scope}`);
  const hasSpecificMatch = specificTokens.some(
    (token) =>
      titleScopeTokens.has(token) ||
      (token === "ia" &&
        /\binteligencia artificial\b|\bmachine learning\b/.test(
          normalizedTitleScopeText,
        )) ||
      (token === "api" &&
        /\binterfaz(?:es)? de programacion de aplicaciones\b/.test(
          normalizedTitleScopeText,
        )),
  );
  const genericPhrase = normalizeSearchText(input.query).replace(/\s+/g, " ").trim();
  const normalizedTitleScope = normalizedTitleScopeText;
  const genericQuerySupported =
    specificTokens.length > 0
      ? hasSpecificMatch
      : queryTokens.length >= 2 && normalizedTitleScope.includes(genericPhrase);
  return {
    related: coverage >= input.minCoverage && genericQuerySupported,
    coverage,
    matched,
  };
}

const BUYER_ROLE = /\b(?:invita(?:mos|n)? a (?:proveedores|presentar)|solicita(?:mos|n)? (?:propuestas|cotizaciones|ofertas)|recibir[aá] (?:cotizaciones|propuestas|ofertas)|contratar[aá] (?:a |un |una )?(?:proveedor|empresa|agencia|consultor)|t[eé]rminos de referencia para contratar|presentaci[oó]n de (?:ofertas|propuestas)|requisitos para oferentes|proveedores interesados)\b/i;
const SELLER_ROLE = /\b(?:ofrecemos|nuestros servicios|solicite una cotizaci[oó]n con nosotros|cotiza con nosotros|cont[aá]ctenos para|cont[aá]ctanos para|conoce nuestros precios|testimonios de clientes|te ayudamos a|somos una (?:agencia|empresa))\b/i;

export function classifyOpportunityRole(text: string): OpportunityRole {
  const buyer = BUYER_ROLE.test(text);
  const seller = SELLER_ROLE.test(text);
  if (buyer && seller) return "AMBIGUOUS";
  if (buyer) return "BUYER";
  if (seller) return "SELLER";
  return "AMBIGUOUS";
}

export function parseLocalizedDecimal(raw: string): string | null {
  const value = raw.trim();
  if (!/^\d+(?:[.,]\d+)*(?:[.,]\d+)?$/.test(value)) return null;
  const comma = value.lastIndexOf(",");
  const dot = value.lastIndexOf(".");
  const separators = [...value].filter((char) => char === "," || char === ".");
  if (separators.length === 0) return value.replace(/^0+(?=\d)/, "") || "0";

  const decimalSeparator = comma > dot ? "," : ".";
  const decimalIndex = Math.max(comma, dot);
  const fraction = value.slice(decimalIndex + 1);
  if (fraction.length < 1 || fraction.length > 2) return null;
  const integerRaw = value.slice(0, decimalIndex);
  const thousandsSeparator = decimalSeparator === "," ? "." : ",";

  if (integerRaw.includes(decimalSeparator)) return null;
  if (integerRaw.includes(thousandsSeparator)) {
    const groups = integerRaw.split(thousandsSeparator);
    if (
      !groups[0] ||
      groups[0].length > 3 ||
      groups.slice(1).some((group) => group.length !== 3)
    ) {
      return null;
    }
  }
  const integer = integerRaw.replace(/[.,]/g, "").replace(/^0+(?=\d)/, "") || "0";
  return `${integer}.${fraction.padEnd(2, "0")}`;
}

export type ContractAmount = {
  amount: string;
  currency: "USD";
  evidence: string;
};

const CONTRACT_AMOUNT_CONTEXT = /monto del contrato|presupuesto de la contrataci[oó]n|valor estimado de la consultor[ií]a|valor estimado del contrato|monto estimado de la contrataci[oó]n/i;
const NON_CONTRACT_AMOUNT_CONTEXT = /presupuesto general|presupuesto total del programa|presupuesto del programa|salario|remuneraci[oó]n|honorario mensual/i;
const MONEY = /(?:\bUSD\s*\$?\s*([0-9][0-9.,]{0,24})|\$\s*([0-9][0-9.,]{0,24})\s*(?:USD|d[oó]lares)|\b([0-9][0-9.,]{0,24})\s*(?:USD|d[oó]lares))\b/gi;

export function extractContractAmount(text: string): ContractAmount | null {
  const candidates: ContractAmount[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!CONTRACT_AMOUNT_CONTEXT.test(line) || NON_CONTRACT_AMOUNT_CONTEXT.test(line)) {
      continue;
    }
    for (const match of line.matchAll(MONEY)) {
      const raw = match[1] ?? match[2] ?? match[3];
      if (!raw) continue;
      const amount = parseLocalizedDecimal(raw);
      if (amount) {
        candidates.push({ amount, currency: "USD", evidence: line.trim().slice(0, 1_000) });
      }
    }
  }
  const unique = new Map(candidates.map((candidate) => [candidate.amount, candidate]));
  return unique.size === 1 ? [...unique.values()][0] ?? null : null;
}

type DeadlinePrecision = "DATE" | "LOCAL_TIME" | "ZONED_TIME";
export type DeadlineEvidence = {
  iso: string;
  evidence: string;
  precision: DeadlinePrecision;
};
export type DeadlineScan =
  | { status: "NONE"; deadlines: [] }
  | { status: "SINGLE"; deadlines: [DeadlineEvidence] }
  | { status: "AMBIGUOUS"; deadlines: DeadlineEvidence[] };

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12,
};
const DEADLINE_LABEL = /fecha l[ií]mite|fecha de cierre|\bcierre\b|presentaci[oó]n de propuestas|recepci[oó]n de ofertas|\bdeadline\b|submit by|proposals due/i;

function validLocalDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parseDeadlineLine(line: string): DeadlineEvidence | null {
  const normalized = normalizeSearchText(line);
  let year: number | null = null;
  let month: number | null = null;
  let day: number | null = null;
  let tail = "";
  const iso = line.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})([^\n]*)/);
  const numeric = line.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})([^\n]*)/);
  const spanish = normalized.match(/\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(20\d{2})([^\n]*)/);
  if (iso) {
    year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3]); tail = iso[4] ?? "";
  } else if (numeric) {
    day = Number(numeric[1]); month = Number(numeric[2]); year = Number(numeric[3]); tail = numeric[4] ?? "";
  } else if (spanish) {
    day = Number(spanish[1]); month = MONTHS[spanish[2] ?? ""] ?? null; year = Number(spanish[3]); tail = spanish[4] ?? "";
  }
  if (year === null || month === null || day === null || !validLocalDate(year, month, day)) return null;

  const time = tail.match(/(?:a\s+las|at|t)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*(Z|[+-]\d{2}:?\d{2})?/i);
  if (!time) {
    return {
      iso: new Date(Date.UTC(year, month - 1, day + 1, 5, 59, 59, 999)).toISOString(),
      evidence: line.trim().slice(0, 1_000),
      precision: "DATE",
    };
  }
  let hour = Number(time[1]);
  const minute = Number(time[2]);
  const second = Number(time[3] ?? 0);
  const meridiem = time[4]?.toLowerCase().replace(/\./g, "");
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59 || second > 59) return null;
  const zone = time[5];
  if (zone) {
    const zoneText = zone === "Z" ? "Z" : `${zone.slice(0, 3)}:${zone.replace(":", "").slice(3)}`;
    const instant = new Date(
      `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}${zoneText}`,
    );
    if (Number.isNaN(instant.getTime())) return null;
    return { iso: instant.toISOString(), evidence: line.trim().slice(0, 1_000), precision: "ZONED_TIME" };
  }
  return {
    iso: new Date(Date.UTC(year, month - 1, day, hour + 6, minute, second)).toISOString(),
    evidence: line.trim().slice(0, 1_000),
    precision: "LOCAL_TIME",
  };
}

export function scanDeadlineDates(text: string): DeadlineScan {
  const found: DeadlineEvidence[] = [];
  const labelPattern = new RegExp(DEADLINE_LABEL.source, "gi");
  for (const match of text.matchAll(labelPattern)) {
    const start = match.index ?? 0;
    const segment = text
      .slice(start, Math.min(text.length, start + 400))
      .split(/\r?\n/)
      .slice(0, 3)
      .join(" ");
    const positions = new Set<number>();
    const datePatterns = [
      /\b20\d{2}-\d{1,2}-\d{1,2}(?!\d)/g,
      /\b\d{1,2}[\/-]\d{1,2}[\/-]20\d{2}\b/g,
      /\b\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?20\d{2}\b/gi,
    ];
    for (const pattern of datePatterns) {
      for (const dateMatch of segment.matchAll(pattern)) {
        if (dateMatch.index !== undefined) positions.add(dateMatch.index);
      }
    }
    const orderedPositions = [...positions].sort((left, right) => left - right);
    for (const [index, position] of orderedPositions.entries()) {
      const nextPosition = orderedPositions[index + 1];
      const parsed = parseDeadlineLine(
        segment.slice(
          position,
          Math.min(position + 140, nextPosition ?? segment.length),
        ),
      );
      if (parsed) found.push(parsed);
    }
  }
  const unique = new Map(found.map((item) => [item.iso, item]));
  const deadlines = [...unique.values()];
  if (deadlines.length === 0) return { status: "NONE", deadlines: [] };
  if (deadlines.length === 1) return { status: "SINGLE", deadlines: [deadlines[0]!] };
  return { status: "AMBIGUOUS", deadlines };
}
