export const deadlinePresets = [
  "ACTIVE",
  "EXPIRED",
  "NONE",
  "NEXT_7",
  "NEXT_15",
  "NEXT_30",
  "CUSTOM",
  "ANY",
] as const;

export type DeadlinePreset = (typeof deadlinePresets)[number];

export const deadlinePresetLabels: Record<DeadlinePreset, string> = {
  ACTIVE: "Vigentes",
  EXPIRED: "Vencidas",
  NONE: "Sin fecha",
  NEXT_7: "Próximos 7 días",
  NEXT_15: "Próximos 15 días",
  NEXT_30: "Próximos 30 días",
  CUSTOM: "Rango personalizado",
  ANY: "Cualquier plazo",
};

export const discoveredPresets = [
  "TODAY",
  "LAST_7",
  "LAST_30",
  "CUSTOM",
  "ANY",
] as const;

export type DiscoveredPreset = (typeof discoveredPresets)[number];

export const discoveredPresetLabels: Record<DiscoveredPreset, string> = {
  TODAY: "Hoy",
  LAST_7: "Últimos 7 días",
  LAST_30: "Últimos 30 días",
  CUSTOM: "Rango personalizado",
  ANY: "Cualquier fecha",
};

export const scorePresets = [
  "VERY_RELEVANT",
  "RELEVANT",
  "POTENTIAL",
  "ANY",
  "CUSTOM",
] as const;

export type ScorePreset = (typeof scorePresets)[number];

export const scorePresetLabels: Record<ScorePreset, string> = {
  VERY_RELEVANT: "Muy relevante (85–100)",
  RELEVANT: "Relevante (70–100)",
  POTENTIAL: "Potencial (50–100)",
  ANY: "Cualquier score",
  CUSTOM: "Personalizado",
};

export function scoreRangeForPreset(
  preset: ScorePreset,
): { minScore?: number; maxScore?: number } {
  switch (preset) {
    case "VERY_RELEVANT":
      return { minScore: 85, maxScore: 100 };
    case "RELEVANT":
      return { minScore: 70, maxScore: 100 };
    case "POTENTIAL":
      return { minScore: 50, maxScore: 100 };
    case "ANY":
      return {};
    case "CUSTOM":
      return {};
  }
}

export function detectScorePreset(
  minScore: number | undefined,
  maxScore: number | undefined,
): ScorePreset {
  if (minScore === undefined && maxScore === undefined) {
    return "ANY";
  }
  if (minScore === 85 && (maxScore === undefined || maxScore === 100)) {
    return "VERY_RELEVANT";
  }
  if (minScore === 70 && (maxScore === undefined || maxScore === 100)) {
    return "RELEVANT";
  }
  if (minScore === 50 && (maxScore === undefined || maxScore === 100)) {
    return "POTENTIAL";
  }
  return "CUSTOM";
}

/** Map legacy vigency → deadlinePreset. */
export function deadlinePresetFromVigency(
  vigency: string | undefined,
): DeadlinePreset | undefined {
  if (vigency === "ACTIVE") return "ACTIVE";
  if (vigency === "EXPIRED") return "EXPIRED";
  if (vigency === "ALL") return "ANY";
  return undefined;
}

/** Derive legacy vigency for URLs that still expect it. */
export function vigencyFromDeadlinePreset(
  preset: DeadlinePreset,
): "ACTIVE" | "EXPIRED" | "ALL" {
  if (preset === "ACTIVE") return "ACTIVE";
  if (preset === "EXPIRED") return "EXPIRED";
  return "ALL";
}

export function addDays(base: Date, days: number): Date {
  const result = new Date(base.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}
