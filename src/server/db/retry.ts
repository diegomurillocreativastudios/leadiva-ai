/**
 * Neon HTTP can fail transiently (cold start, brief network blips).
 * Retry only connection/fetch-style errors — never mutate retries.
 */

export function isTransientDbError(error: unknown): boolean {
  const parts: string[] = [];

  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (current instanceof Error) {
      parts.push(current.message, current.name);
      current = current.cause;
      continue;
    }
    if (typeof current === "object" && current !== null && "message" in current) {
      parts.push(String((current as { message: unknown }).message));
    }
    break;
  }

  const blob = parts.join(" ").toLowerCase();
  return (
    blob.includes("fetch failed") ||
    blob.includes("error connecting to database") ||
    blob.includes("econnreset") ||
    blob.includes("etimedout") ||
    blob.includes("enotfound") ||
    blob.includes("socket hang up") ||
    blob.includes("network") ||
    blob.includes("und_err_")
  );
}

export async function withTransientDbRetry<T>(
  operation: () => Promise<T>,
  options?: {
    retries?: number;
    baseDelayMs?: number;
  },
): Promise<T> {
  const retries = options?.retries ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 200;
  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const shouldRetry =
        isTransientDbError(error) && attempt < retries - 1;
      if (!shouldRetry) {
        throw error;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, baseDelayMs * (attempt + 1)),
      );
    }
  }

  throw lastError;
}
