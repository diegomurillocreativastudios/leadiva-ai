/**
 * URL search-param helpers for multi-value filter query strings.
 * Uses repeated keys: ?categories=AI&categories=SOFTWARE
 */

export type SearchParamsInput = Record<
  string,
  string | string[] | undefined
>;

/** Returns undefined when the key is absent; [] when present but empty. */
export function getParamValues(
  params: SearchParamsInput,
  key: string,
): string[] | undefined {
  const value = params[key];
  if (value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter((item) => item.length > 0);
  }
  if (value === "") {
    return [];
  }
  return [value.trim()].filter((item) => item.length > 0);
}

/** Merge plural + legacy singular keys (plural wins when present). */
export function getParamValuesWithLegacy(
  params: SearchParamsInput,
  pluralKey: string,
  singularKey: string,
): string[] | undefined {
  const plural = getParamValues(params, pluralKey);
  if (plural !== undefined) {
    return plural;
  }
  return getParamValues(params, singularKey);
}

export function getSingleParam(
  params: SearchParamsInput,
  key: string,
): string | undefined {
  const value = params[key];
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(value)) {
    const first = value.find((item) => item.trim().length > 0);
    return first?.trim();
  }
  return undefined;
}

export function dedupeStrings<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

export function buildFilterQueryString(
  params: Record<
    string,
    string | number | boolean | readonly string[] | undefined | null
  >,
): string {
  const search = new URLSearchParams();

  const keys = Object.keys(params).sort();
  for (const key of keys) {
    const value = params[key];
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (typeof value === "boolean") {
      if (value) {
        search.set(key, "1");
      }
      continue;
    }
    if (Array.isArray(value)) {
      const unique = dedupeStrings(value.map(String).filter(Boolean));
      for (const item of unique) {
        search.append(key, item);
      }
      continue;
    }
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `?${query}` : "";
}
