import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({ db: {} }));

import type { MappedComprasalAvailableSearchResult } from "./available-mapper";
import type { ComprasalAvailableProcess } from "./available-normalize";
import type { ComprasalAvailableSnapshot } from "./available-pagination";
import {
  runComprasalAvailableSearchWithDependencies,
  type ComprasalAvailableSearchRepository,
} from "./available-service";

const RESULT_ID = "00000000-0000-4000-8000-000000000101";
const EXECUTION_IDS = [
  "00000000-0000-4000-8000-000000000201",
  "00000000-0000-4000-8000-000000000202",
] as const;

function processFixture(): ComprasalAvailableProcess {
  return {
    id: 121645,
    externalId: "121645",
    title: "Licencias de software",
    code: "P-121645",
    version: 1,
    institution: "Ministerio de Tecnología",
    currentState: "Recepción de ofertas",
    processState: "PUBLICADO",
    contractingMethod: "Licitación competitiva",
    contractingMethodCode: "LC",
    currentStage: {
      id: 31,
      name: "Recepción de ofertas",
      startsAt: "2026-07-17T14:00:00.000Z",
      endsAt: "2026-08-01T23:59:59.000Z",
    },
    publishedAt: "2026-07-15T12:00:00.000Z",
    deadlineAt: "2026-08-01T23:59:59.000Z",
    activityNames: ["Software"],
    rawData: { id: 121645, nombre_proceso: "Licencias de software" },
  };
}

function successfulSnapshot(): ComprasalAvailableSnapshot {
  return {
    processes: [processFixture()],
    metrics: {
      pagesFetched: 1,
      rowsFetched: 1,
      invalidRows: 0,
      duplicateRows: 0,
      totalRows: 1,
      defensiveLimitReached: null,
    },
  };
}

function createMemoryRepository() {
  const canonical = new Map<
    string,
    { id: string; contentHash: string | null; verificationStatus: string }
  >();
  const finished: Array<{
    executionId: string;
    metrics: Record<string, unknown>;
    status: string;
  }> = [];
  let executionIndex = 0;
  const createResult = vi.fn(
    async (_executionId: string, mapped: MappedComprasalAvailableSearchResult) => {
      canonical.set(mapped.externalId, {
        id: RESULT_ID,
        contentHash: mapped.contentHash,
        verificationStatus: "VERIFIED",
      });
      return { id: RESULT_ID };
    },
  );
  const updateResult = vi.fn(
    async (id: string, mapped: MappedComprasalAvailableSearchResult) => {
      canonical.set(mapped.externalId, {
        id,
        contentHash: mapped.contentHash,
        verificationStatus: "VERIFIED",
      });
    },
  );
  const repository: ComprasalAvailableSearchRepository = {
    ensureProfile: async () => ({ id: "00000000-0000-4000-8000-000000000301" }),
    createExecution: async () => {
      const id = EXECUTION_IDS[executionIndex];
      executionIndex += 1;
      if (!id) throw new Error("fixture ran out of execution ids");
      return { id };
    },
    findCanonicalResult: async (externalId) => canonical.get(externalId) ?? null,
    createResult,
    updateResult,
    finishExecution: async (input) => {
      finished.push({
        executionId: input.executionId,
        metrics: input.metrics,
        status: input.status,
      });
    },
  };
  return { canonical, createResult, finished, repository, updateResult };
}

describe("COMPRASAL available search persistence", () => {
  it("preserves the first execution when the same process appears in a later search", async () => {
    const memory = createMemoryRepository();
    const loadSnapshot = async () => ({
      snapshot: successfulSnapshot(),
      cacheHit: false,
      cacheAgeMs: 0,
    });

    const first = await runComprasalAvailableSearchWithDependencies({
      userId: "00000000-0000-4000-8000-000000000401",
      query: "software",
      repository: memory.repository,
      loadSnapshot,
    });
    const firstMetricsBeforeSecond = structuredClone(memory.finished[0]?.metrics);
    const second = await runComprasalAvailableSearchWithDependencies({
      userId: "00000000-0000-4000-8000-000000000401",
      query: "licencias software",
      repository: memory.repository,
      loadSnapshot,
    });

    expect(first.candidatesCreated).toBe(1);
    expect(second.candidatesUnchanged).toBe(1);
    expect(memory.createResult).toHaveBeenCalledTimes(1);
    expect(memory.updateResult).not.toHaveBeenCalled();
    expect(memory.finished[0]?.metrics).toEqual(firstMetricsBeforeSecond);
    expect(memory.finished[0]?.metrics.executionCandidates).toMatchObject([
      { searchResultId: RESULT_ID },
    ]);
    expect(memory.finished[1]?.metrics.executionCandidates).toMatchObject([
      { searchResultId: RESULT_ID },
    ]);
  });

  it("conserves a canonical REJECTED result without updating or returning it", async () => {
    const memory = createMemoryRepository();
    memory.canonical.set("121645", {
      id: RESULT_ID,
      contentHash: "old",
      verificationStatus: "REJECTED",
    });
    const result = await runComprasalAvailableSearchWithDependencies({
      userId: "00000000-0000-4000-8000-000000000401",
      query: "software",
      repository: memory.repository,
      loadSnapshot: async () => ({
        snapshot: successfulSnapshot(),
        cacheHit: true,
        cacheAgeMs: 10,
      }),
    });
    expect(result).toMatchObject({ candidatesFound: 0, candidatesRejected: 1 });
    expect(memory.updateResult).not.toHaveBeenCalled();
  });

  it("does not hide persistence failures behind COMPLETED", async () => {
    const memory = createMemoryRepository();
    memory.repository.createResult = async () => {
      throw new Error("database unavailable");
    };
    const result = await runComprasalAvailableSearchWithDependencies({
      userId: "00000000-0000-4000-8000-000000000401",
      query: "software",
      repository: memory.repository,
      loadSnapshot: async () => ({
        snapshot: successfulSnapshot(),
        cacheHit: false,
        cacheAgeMs: 0,
      }),
    });
    expect(result).toMatchObject({ status: "FAILED", persistenceErrors: 1 });
    expect(memory.finished[0]?.metrics).toMatchObject({ persistenceErrors: 1 });
  });
});
