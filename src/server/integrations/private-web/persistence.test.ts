import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
}));

vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/db/transaction", () => ({
  transactionDb: { transaction: mocks.transaction },
}));

import {
  databasePrivateWebRepository,
  type StartPrivateWebExecutionInput,
} from "./persistence";

type RunningExecution = { id: string; startedAt: Date };
type AdmissionState = {
  executions: RunningExecution[];
  statements: string[];
  transactionEvents: string[][];
  nextExecution: number;
};

function createFakeTransaction(state: AdmissionState) {
  let insertCount = 0;
  let selectCount = 0;
  const events: string[] = [];
  state.transactionEvents.push(events);

  return {
    execute: async (statement: SQL) => {
      const rendered = new PgDialect().sqlToQuery(statement).sql.toLowerCase();
      state.statements.push(rendered);
      events.push("advisory-lock");
      return { rows: [] };
    },
    update: () => ({
      set: () => ({ where: async () => [] }),
    }),
    select: () => {
      const currentSelect = selectCount;
      selectCount += 1;
      return {
        from: () => ({
          where: () => ({
            orderBy: async () => {
              if (currentSelect === 0) {
                events.push("active-check");
              } else {
                events.push("rate-check");
              }
              return state.executions.map(({ startedAt }) => ({ startedAt }));
            },
          }),
        }),
      };
    },
    insert: () => {
      const currentInsert = insertCount;
      insertCount += 1;
      return {
        values: (values: Record<string, unknown>) => ({
          onConflictDoUpdate: () => ({
            returning: async () => [
              { id: "00000000-0000-4000-8000-000000000501" },
            ],
          }),
          returning: async () => {
            if (currentInsert === 0) {
              return [{ id: "00000000-0000-4000-8000-000000000501" }];
            }
            const startedAt = values.startedAt;
            if (!(startedAt instanceof Date)) {
              throw new Error("expected execution startedAt");
            }
            state.nextExecution += 1;
            const id = `00000000-0000-4000-8000-${String(
              state.nextExecution,
            ).padStart(12, "0")}`;
            state.executions.push({ id, startedAt });
            events.push("execution-insert");
            return [{ id }];
          },
        }),
      };
    },
  };
}

function admissionHarness() {
  const state: AdmissionState = {
    executions: [],
    statements: [],
    transactionEvents: [],
    nextExecution: 0,
  };
  let tail = Promise.resolve();
  mocks.transaction.mockImplementation(
    (callback: (tx: ReturnType<typeof createFakeTransaction>) => Promise<unknown>) => {
      const result = tail.then(() => callback(createFakeTransaction(state)));
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  );
  return state;
}

function input(
  overrides: Partial<StartPrivateWebExecutionInput> = {},
): StartPrivateWebExecutionInput {
  return {
    userId: "00000000-0000-4000-8000-000000000401",
    query: "desarrollo de software",
    now: new Date("2026-07-20T12:00:00.000Z"),
    maxConcurrent: 1,
    maxPerHour: 10,
    staleExecutionMinutes: 10,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.transaction.mockReset();
});

describe("PRIVATE_WEB atomic admission", () => {
  it("uses the interactive driver and keeps the advisory lock, checks and insert together", async () => {
    const state = admissionHarness();

    await expect(
      databasePrivateWebRepository.startExecution(input()),
    ).resolves.toMatchObject({ kind: "STARTED" });

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(state.statements).toHaveLength(1);
    expect(state.statements[0]).toContain("pg_advisory_xact_lock");
    expect(state.transactionEvents[0]).toEqual([
      "advisory-lock",
      "active-check",
      "rate-check",
      "execution-insert",
    ]);
  });

  it("serializes two simultaneous requests for one user at the active limit", async () => {
    const state = admissionHarness();

    const results = await Promise.all([
      databasePrivateWebRepository.startExecution(input()),
      databasePrivateWebRepository.startExecution(input()),
    ]);

    expect(results.map((result) => result.kind)).toEqual([
      "STARTED",
      "ACTIVE_LIMIT",
    ]);
    expect(state.executions).toHaveLength(1);
    expect(state.statements).toHaveLength(2);
    expect(
      state.statements.every((statement) =>
        statement.includes("pg_advisory_xact_lock"),
      ),
    ).toBe(true);
  });

  it("keeps the hourly rate decision atomic with execution creation", async () => {
    const state = admissionHarness();
    const rateLimitedInput = input({ maxConcurrent: 10, maxPerHour: 1 });

    const results = await Promise.all([
      databasePrivateWebRepository.startExecution(rateLimitedInput),
      databasePrivateWebRepository.startExecution(rateLimitedInput),
    ]);

    expect(results.map((result) => result.kind)).toEqual([
      "STARTED",
      "RATE_LIMIT",
    ]);
    expect(state.executions).toHaveLength(1);
  });
});
