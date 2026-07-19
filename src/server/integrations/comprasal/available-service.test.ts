import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({ db: {} }));

import type { ComprasalAvailableProcess } from "./available-normalize";
import {
  ComprasalAvailablePaginationError,
  type ComprasalAvailableSnapshot,
} from "./available-pagination";
import {
  runComprasalAvailableSearchWithDependencies,
  type ComprasalAvailableSearchRepository,
} from "./available-service";

const RESULT_ID = "00000000-0000-4000-8000-000000000101";

function processFixture(
  overrides: Partial<ComprasalAvailableProcess> = {},
): ComprasalAvailableProcess {
  const id = overrides.id ?? 121645;
  return {
    id,
    externalId: `available:${id}`,
    title: "Licencias de software",
    code: `P-${id}`,
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
    publicationStage: {
      id: 30,
      name: "Publicación de convocatoria en COMPRASAL",
      startsAt: "2026-07-15T12:00:00.000Z",
      endsAt: "2026-07-17T13:59:59.000Z",
    },
    deadlineAt: "2026-08-01T23:59:59.000Z",
    activityNames: ["Software"],
    rawData: { id, nombre_proceso: "Licencias de software" },
    ...overrides,
  };
}

function snapshot(
  processes: ComprasalAvailableProcess[] = [processFixture()],
  invalidRows = 0,
): ComprasalAvailableSnapshot {
  return {
    processes,
    metrics: {
      requestsExecuted: 1,
      pagesFetched: 1,
      rowsFetched: processes.length + invalidRows,
      invalidRows,
      duplicateRows: 0,
      totalRows: processes.length + invalidRows,
      defensiveLimitReached: null,
      snapshotIssue: invalidRows > 0 ? "INVALID_ROWS" : null,
    },
  };
}

function executionId(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function createMemoryRepository() {
  const canonical = new Map<
    string,
    {
      id: string;
      contentHash: string | null;
      verificationStatus: string;
      ownerExecutionId: string;
    }
  >();
  const associations = new Map<
    string,
    Array<{ resultId: string; score: number; rank: number }>
  >();
  const dismissed = new Set<string>();
  const profiles = new Map<string, string>();
  const finished: Array<{
    executionId: string;
    metrics: Record<string, unknown>;
    status: string;
  }> = [];
  let executionIndex = 200;
  let resultIndex = 100;
  let failPersistence = false;

  const repository: ComprasalAvailableSearchRepository = {
    ensureProfile: async (userId) => {
      await Promise.resolve();
      const id =
        profiles.get(userId) ??
        `00000000-0000-4000-8000-${String(300 + profiles.size).padStart(12, "0")}`;
      profiles.set(userId, id);
      return { id };
    },
    createExecution: async () => ({ id: executionId(++executionIndex) }),
    persistCandidate: async (params) => {
      await Promise.resolve();
      if (failPersistence) throw new Error("database unavailable");
      const current = canonical.get(params.mapped.externalId);
      if (current?.verificationStatus === "REJECTED") {
        return { kind: "GLOBAL_REJECTED" } as const;
      }
      const row =
        current ??
        {
          id:
            params.mapped.externalId === "available:121645"
              ? RESULT_ID
              : executionId(++resultIndex),
          contentHash: params.mapped.contentHash,
          verificationStatus: "VERIFIED",
          ownerExecutionId: params.executionId,
        };
      const outcome = !current
        ? "CREATED"
        : current.contentHash === params.mapped.contentHash
          ? "UNCHANGED"
          : "UPDATED";
      row.contentHash = params.mapped.contentHash;
      canonical.set(params.mapped.externalId, row);
      if (dismissed.has(`${params.userId}:${row.id}`)) {
        return { kind: "DISMISSED" } as const;
      }
      const rows = associations.get(params.executionId) ?? [];
      rows.push({
        resultId: row.id,
        score: params.preliminaryScore,
        rank: params.rank,
      });
      associations.set(params.executionId, rows);
      return { kind: "PERSISTED", id: row.id, outcome } as const;
    },
    finishExecution: async (input) => {
      finished.push({
        executionId: input.executionId,
        metrics: input.metrics,
        status: input.status,
      });
    },
  };

  return {
    associations,
    canonical,
    dismissed,
    finished,
    profiles,
    repository,
    setFailPersistence(value: boolean) {
      failPersistence = value;
    },
  };
}

function loadSnapshot(value = snapshot(), cacheHit = false) {
  return async () => ({ snapshot: value, cacheHit, cacheAgeMs: cacheHit ? 42 : 0 });
}

describe("COMPRASAL available search persistence", () => {
  it("associates the same process with two executions without reassigning ownership", async () => {
    const memory = createMemoryRepository();
    const userId = "00000000-0000-4000-8000-000000000401";
    const first = await runComprasalAvailableSearchWithDependencies({
      userId,
      query: "software",
      repository: memory.repository,
      loadSnapshot: loadSnapshot(),
    });
    const originalOwner = memory.canonical.get("available:121645")?.ownerExecutionId;
    const second = await runComprasalAvailableSearchWithDependencies({
      userId,
      query: "licencias software",
      repository: memory.repository,
      loadSnapshot: loadSnapshot(),
    });

    expect(first.candidatesCreated).toBe(1);
    expect(second.candidatesUnchanged).toBe(1);
    expect(memory.associations.get(first.executionId)).toHaveLength(1);
    expect(memory.associations.get(second.executionId)).toHaveLength(1);
    expect(memory.canonical.get("available:121645")?.ownerExecutionId).toBe(
      originalOwner,
    );
  });

  it("isolates two users' executions while sharing the canonical process", async () => {
    const memory = createMemoryRepository();
    const [first, second] = await Promise.all([
      runComprasalAvailableSearchWithDependencies({
        userId: "00000000-0000-4000-8000-000000000401",
        query: "software",
        repository: memory.repository,
        loadSnapshot: loadSnapshot(),
      }),
      runComprasalAvailableSearchWithDependencies({
        userId: "00000000-0000-4000-8000-000000000402",
        query: "software",
        repository: memory.repository,
        loadSnapshot: loadSnapshot(),
      }),
    ]);
    expect(memory.canonical).toHaveLength(1);
    expect(first.persistenceErrors).toBe(0);
    expect(second.persistenceErrors).toBe(0);
    expect(memory.associations.get(first.executionId)).toHaveLength(1);
    expect(memory.associations.get(second.executionId)).toHaveLength(1);
  });

  it("hides a private dismissal from user A but not user B", async () => {
    const memory = createMemoryRepository();
    memory.dismissed.add(
      "00000000-0000-4000-8000-000000000401:00000000-0000-4000-8000-000000000101",
    );
    const hidden = await runComprasalAvailableSearchWithDependencies({
      userId: "00000000-0000-4000-8000-000000000401",
      query: "software",
      repository: memory.repository,
      loadSnapshot: loadSnapshot(),
    });
    const visible = await runComprasalAvailableSearchWithDependencies({
      userId: "00000000-0000-4000-8000-000000000402",
      query: "software",
      repository: memory.repository,
      loadSnapshot: loadSnapshot(),
    });
    expect(hidden).toMatchObject({ candidatesFound: 0, candidatesDismissed: 1 });
    expect(visible.candidatesFound).toBe(1);
  });

  it("conserves a canonical REJECTED result", async () => {
    const memory = createMemoryRepository();
    memory.canonical.set("available:121645", {
      id: RESULT_ID,
      contentHash: "old",
      verificationStatus: "REJECTED",
      ownerExecutionId: executionId(999),
    });
    const result = await runComprasalAvailableSearchWithDependencies({
      userId: "00000000-0000-4000-8000-000000000401",
      query: "software",
      repository: memory.repository,
      loadSnapshot: loadSnapshot(snapshot(), true),
    });
    expect(result).toMatchObject({ candidatesFound: 0, candidatesRejected: 1 });
  });

  it("does not hide persistence failures behind COMPLETED", async () => {
    const memory = createMemoryRepository();
    memory.setFailPersistence(true);
    const result = await runComprasalAvailableSearchWithDependencies({
      userId: "00000000-0000-4000-8000-000000000401",
      query: "software",
      repository: memory.repository,
      loadSnapshot: loadSnapshot(),
    });
    expect(result).toMatchObject({ status: "FAILED", persistenceErrors: 1 });
  });

  it("returns PARTIALLY_COMPLETED for valid matches plus invalid rows", async () => {
    const memory = createMemoryRepository();
    const partial = snapshot([processFixture()], 1);
    const result = await runComprasalAvailableSearchWithDependencies({
      userId: "00000000-0000-4000-8000-000000000401",
      query: "software",
      repository: memory.repository,
      loadSnapshot: async () => {
        throw new ComprasalAvailablePaginationError(
          "invalid rows",
          partial.metrics,
          partial,
        );
      },
    });
    expect(result).toMatchObject({
      status: "PARTIALLY_COMPLETED",
      candidatesFound: 1,
    });
    expect(memory.finished[0]?.metrics).toMatchObject({
      invalidRows: 1,
      snapshotIssue: "INVALID_ROWS",
    });
  });

  it("records zero requests on a cache hit and keeps snapshot totals", async () => {
    const memory = createMemoryRepository();
    const result = await runComprasalAvailableSearchWithDependencies({
      userId: "00000000-0000-4000-8000-000000000401",
      query: "software",
      repository: memory.repository,
      loadSnapshot: loadSnapshot(snapshot(), true),
    });
    expect(result).toMatchObject({
      cacheHit: true,
      pagesFetchedThisExecution: 0,
      rowsFetchedThisExecution: 0,
      snapshotPages: 1,
      snapshotRows: 1,
      snapshotRequests: 1,
      queriesExecuted: 0,
    });
    expect(memory.finished[0]?.metrics).toMatchObject({
      pagesFetchedThisExecution: 0,
      rowsFetchedThisExecution: 0,
      snapshotPages: 1,
      snapshotRows: 1,
      snapshotRequests: 1,
    });
  });

  it("limits matches before persistence and records the truncation", async () => {
    const memory = createMemoryRepository();
    const processes = [1, 2, 3].map((id) =>
      processFixture({
        id,
        externalId: `available:${id}`,
        code: `P-${id}`,
        rawData: { id },
      }),
    );
    const result = await runComprasalAvailableSearchWithDependencies({
      userId: "00000000-0000-4000-8000-000000000401",
      query: "software",
      repository: memory.repository,
      loadSnapshot: loadSnapshot(snapshot(processes)),
      maxMatches: 2,
    });
    expect(result).toMatchObject({
      totalMatchesBeforeLimit: 3,
      matchesPersisted: 2,
      resultsLimitReached: true,
    });
  });

  it("creates one profile and avoids a normal concurrent upsert error", async () => {
    const memory = createMemoryRepository();
    const userId = "00000000-0000-4000-8000-000000000401";
    const results = await Promise.all([
      runComprasalAvailableSearchWithDependencies({
        userId,
        query: "software",
        repository: memory.repository,
        loadSnapshot: loadSnapshot(),
      }),
      runComprasalAvailableSearchWithDependencies({
        userId,
        query: "software",
        repository: memory.repository,
        loadSnapshot: loadSnapshot(),
      }),
    ]);
    expect(memory.profiles).toHaveLength(1);
    expect(results.map((result) => result.persistenceErrors)).toEqual([0, 0]);
    expect(memory.canonical).toHaveLength(1);
  });
});
