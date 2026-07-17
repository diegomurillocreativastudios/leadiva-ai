/** Compact relative time in Spanish for sync status bars. */
export function formatRelativeTime(
  value: Date | string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) {
    return "justo ahora";
  }

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) {
    return "justo ahora";
  }
  if (minutes < 60) {
    return `hace ${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `hace ${hours} h`;
  }

  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `hace ${days} d`;
  }

  return date.toLocaleDateString("es-SV");
}
