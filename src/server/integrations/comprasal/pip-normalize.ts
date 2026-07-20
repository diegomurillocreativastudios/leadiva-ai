import { comprasalProcessDetailResponseSchema, comprasalPipStageArraySchema, type ComprasalPipStageRecord } from "./process-detail-schemas";

export type ComprasalPipTemporalStatus =
  | "COMPLETED"
  | "CURRENT"
  | "UPCOMING"
  | "UNKNOWN";

export type ComprasalPipStage = {
  id: string;
  name: string;
  order: number;
  startsAt: string | null;
  endsAt: string | null;
  officialDurationDays: number | null;
  temporalStatus: ComprasalPipTemporalStatus;
};

export type ComprasalPip = {
  stages: ComprasalPipStage[];
  currentStageId: string | null;
  offerDeadlineAt: string | null;
  source: "REMOTE_DETAIL" | "STORED_SNAPSHOT";
  fetchedAt: string | null;
};

export type ComprasalProcessDetailSnapshot = {
  processId: number;
  fetchedAt: string | null;
  stages: Array<{
    id: string;
    name: string;
    startsAt: string | null;
    endsAt: string | null;
    originalPosition: number;
  }>;
};

export class ComprasalProcessDetailContractError extends Error {
  constructor() {
    super("Invalid COMPRASAL process detail payload");
    this.name = "ComprasalProcessDetailContractError";
  }
}

type StageSeed = ComprasalProcessDetailSnapshot["stages"][number];

function toSeed(stage: ComprasalPipStageRecord, index: number): StageSeed {
  return {
    id: String(stage.id),
    name: stage.nombre,
    startsAt: stage.fecha_hora_inicio,
    endsAt: stage.fecha_hora_fin,
    originalPosition: index,
  };
}

function completeness(seed: StageSeed): number {
  return Number(seed.startsAt !== null) + Number(seed.endsAt !== null);
}

function deduplicateSeeds(seeds: StageSeed[]): StageSeed[] {
  const byId = new Map<string, StageSeed>();
  for (const seed of seeds) {
    const existing = byId.get(seed.id);
    if (!existing || completeness(seed) > completeness(existing)) {
      byId.set(seed.id, seed);
    }
  }
  return [...byId.values()];
}

function timestamp(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function sortSeeds(seeds: StageSeed[]): StageSeed[] {
  return [...seeds].sort((left, right) => {
    const leftStart = timestamp(left.startsAt);
    const rightStart = timestamp(right.startsAt);
    if (leftStart !== null && rightStart !== null && leftStart !== rightStart) {
      return leftStart - rightStart;
    }
    if (leftStart === null && rightStart !== null) return 1;
    if (leftStart !== null && rightStart === null) return -1;
    return (
      left.originalPosition - right.originalPosition ||
      left.id.localeCompare(right.id, "en", { numeric: true })
    );
  });
}

export function deriveComprasalPipTemporalStatus(params: {
  startsAt: string | null;
  endsAt: string | null;
  now: Date;
}): ComprasalPipTemporalStatus {
  const startsAt = timestamp(params.startsAt);
  const endsAt = timestamp(params.endsAt);
  const now = params.now.getTime();
  if (endsAt !== null && endsAt < now) return "COMPLETED";
  if (
    startsAt !== null &&
    endsAt !== null &&
    startsAt <= now &&
    now <= endsAt
  ) {
    return "CURRENT";
  }
  if (startsAt !== null && startsAt > now) return "UPCOMING";
  return "UNKNOWN";
}

function normalizedSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function buildPip(params: {
  seeds: StageSeed[];
  now: Date;
  source: ComprasalPip["source"];
  fetchedAt: string | null;
}): ComprasalPip {
  const stages = sortSeeds(deduplicateSeeds(params.seeds)).map(
    (stage, index): ComprasalPipStage => ({
      id: stage.id,
      name: stage.name,
      order: index + 1,
      startsAt: stage.startsAt,
      endsAt: stage.endsAt,
      officialDurationDays: null,
      temporalStatus: deriveComprasalPipTemporalStatus({
        startsAt: stage.startsAt,
        endsAt: stage.endsAt,
        now: params.now,
      }),
    }),
  );
  const currentStage = stages.find(
    (stage) => stage.temporalStatus === "CURRENT",
  );
  const offerStage = stages.find(
    (stage) => normalizedSearchText(stage.name) === "recepcion de ofertas",
  );

  return {
    stages,
    currentStageId: currentStage?.id ?? null,
    offerDeadlineAt: offerStage?.endsAt ?? null,
    source: params.source,
    fetchedAt: params.fetchedAt,
  };
}

export function parseComprasalProcessDetailPayload(
  payload: unknown,
): ComprasalProcessDetailSnapshot | null {
  const parsed = comprasalProcessDetailResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ComprasalProcessDetailContractError();
  }
  if (!parsed.data.data) return null;
  return {
    processId: parsed.data.data.id,
    fetchedAt: null,
    stages: parsed.data.data.EtapaPorProcesos.map(toSeed),
  };
}

export function normalizeComprasalRemotePip(params: {
  snapshot: ComprasalProcessDetailSnapshot;
  now: Date;
}): ComprasalPip {
  return buildPip({
    seeds: params.snapshot.stages,
    now: params.now,
    source: "REMOTE_DETAIL",
    fetchedAt: params.snapshot.fetchedAt,
  });
}

function readStoredSeeds(
  rawData: Record<string, unknown> | null,
  key: "etapas" | "EtapaPorProcesos",
): StageSeed[] | null {
  const value = rawData?.[key];
  if (value === undefined || value === null) return [];
  const parsed = comprasalPipStageArraySchema.safeParse(value);
  if (!parsed.success) return null;
  return parsed.data.map(toSeed);
}

export function normalizeComprasalStoredEtapas(params: {
  rawData: Record<string, unknown> | null;
  now: Date;
}): ComprasalPipStage[] | null {
  const seeds = readStoredSeeds(params.rawData, "etapas");
  return seeds
    ? buildPip({
        seeds,
        now: params.now,
        source: "STORED_SNAPSHOT",
        fetchedAt: null,
      }).stages
    : null;
}

export function normalizeComprasalStoredCurrentStages(params: {
  rawData: Record<string, unknown> | null;
  now: Date;
}): ComprasalPipStage[] | null {
  const seeds = readStoredSeeds(params.rawData, "EtapaPorProcesos");
  return seeds
    ? buildPip({
        seeds,
        now: params.now,
        source: "STORED_SNAPSHOT",
        fetchedAt: null,
      }).stages
    : null;
}

export function normalizeComprasalStoredPip(params: {
  rawData: Record<string, unknown> | null;
  now: Date;
}): ComprasalPip | null {
  const stages = readStoredSeeds(params.rawData, "etapas");
  const currentStages = readStoredSeeds(params.rawData, "EtapaPorProcesos");
  const validSources = [stages, currentStages].filter(
    (source): source is StageSeed[] => source !== null,
  );
  if (validSources.length === 0) return null;

  return buildPip({
    seeds: validSources.flat(),
    now: params.now,
    source: "STORED_SNAPSHOT",
    fetchedAt: null,
  });
}
