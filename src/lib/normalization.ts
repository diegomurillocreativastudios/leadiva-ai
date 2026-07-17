const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "dclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "source",
]);

const GOOGLE_REDIRECT_HOSTS = new Set([
  "google.com",
  "www.google.com",
  "googleusercontent.com",
  "www.googleusercontent.com",
]);

/** Returns the destination embedded in common Google redirect URLs. */
export function unwrapGoogleUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl.trim());
    const hostname = url.hostname.toLowerCase();
    const isGoogleHost =
      GOOGLE_REDIRECT_HOSTS.has(hostname) || hostname.endsWith(".google.com");
    if (!isGoogleHost) {
      return url.toString();
    }

    for (const key of ["url", "q", "u", "imgurl"]) {
      const target = url.searchParams.get(key);
      if (!target) {
        continue;
      }
      const decoded = decodeURIComponent(target);
      const candidate = new URL(decoded);
      if (candidate.protocol === "http:" || candidate.protocol === "https:") {
        return candidate.toString();
      }
    }

    return url.toString();
  } catch {
    return rawUrl.trim();
  }
}

export function normalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(unwrapGoogleUrl(rawUrl));
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();

    if (
      (url.protocol === "http:" && url.port === "80") ||
      (url.protocol === "https:" && url.port === "443")
    ) {
      url.port = "";
    }

    if (url.pathname.endsWith("/") && url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }

    for (const param of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(param.toLowerCase())) {
        url.searchParams.delete(param);
      }
    }

    url.searchParams.sort();

    return url.toString();
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

/**
 * Canonical key for comparing sources. HTTP and HTTPS are intentionally
 * equivalent here because search citations and final redirects often differ.
 */
export function urlEquivalenceKey(rawUrl: string): string | null {
  try {
    const url = new URL(normalizeUrl(rawUrl));
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return `${url.hostname}${url.pathname}${url.search}`.toLowerCase();
  } catch {
    return null;
  }
}

export function areEquivalentUrls(left: string, right: string): boolean {
  const leftKey = urlEquivalenceKey(left);
  const rightKey = urlEquivalenceKey(right);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
}

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 280);
}

export function extractDomain(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function inferCategoryFromText(text: string): string {
  const value = text.toLowerCase();

  if (
    /\b(inteligencia artificial|machine learning|\bai\b|llm|gemini|openai)\b/.test(
      value,
    )
  ) {
    return "AI";
  }

  if (
    /\b(consultor[ií]a|asesor[ií]a|servicios profesionales(?:\s+ti)?)\b/.test(
      value,
    )
  ) {
    return "CONSULTING";
  }

  if (
    /\b(software|sistema inform[aá]tico|aplicaci[oó]n(?:es)?|desarrollo(?:\s+y\s+mantenci[oó]n|\s+y\s+mantenimiento)?\s+de\s+software|mantenci[oó]n\s+de\s+software|mantenimiento\s+de\s+software|desarrollo web|plataforma (?:digital|web)|licencia(?:s)? de software|\berp\b|\bcrm\b|sitio web|p[aá]gina web)\b/.test(
      value,
    ) ||
    (/\b(sistema|plataforma)\b/.test(value) &&
      /\b(software|inform[aá]tic|digital|web|app|datos|gestion|gestión)\b/.test(
        value,
      ))
  ) {
    return "SOFTWARE";
  }

  if (
    /\b(tecnolog[ií]a|infraestructura|redes|servidor|cloud(?:\s+computing)?|ti\b|it\b)\b/.test(
      value,
    )
  ) {
    return "IT";
  }

  return "OTHER";
}

/**
 * Prefer model category when concrete; never trust OTHER over text inference.
 * Models often emit OTHER even when the title already names software / TI / cloud.
 */
export function resolveOpportunityCategory(params: {
  category?: string | null;
  text: string;
}): string {
  if (params.category && params.category !== "OTHER") {
    return params.category;
  }
  return inferCategoryFromText(params.text);
}
