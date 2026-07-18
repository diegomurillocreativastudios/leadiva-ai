type Metrics = Record<string, unknown> | null | undefined;

export function isSearchExecutionHiddenFromHistory(metrics: Metrics): boolean {
  return metrics?.hiddenFromHistory === true;
}

export function withSearchExecutionTitle(
  metrics: Metrics,
  title: string,
): Record<string, unknown> {
  return {
    ...(metrics ?? {}),
    title: title.trim(),
  };
}

export function withSearchExecutionHiddenFromHistory(
  metrics: Metrics,
): Record<string, unknown> {
  return {
    ...(metrics ?? {}),
    hiddenFromHistory: true,
  };
}
