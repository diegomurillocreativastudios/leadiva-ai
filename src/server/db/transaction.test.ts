import type { Pool } from "@neondatabase/serverless";
import { afterEach, describe, expect, it, vi } from "vitest";

type TransactionGlobal = typeof globalThis & {
  leadivaTransactionPool?: Pool;
  leadivaTransactionDb?: unknown;
};

const transactionGlobal = globalThis as TransactionGlobal;

afterEach(async () => {
  const pool = transactionGlobal.leadivaTransactionPool;
  delete transactionGlobal.leadivaTransactionPool;
  delete transactionGlobal.leadivaTransactionDb;
  if (pool && !pool.ended) await pool.end();
  vi.doUnmock("@/env/server");
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("transaction pool lifecycle", () => {
  it("reuses one Pool and database across development hot reloads", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.doMock("@/env/server", () => ({
      getServerEnv: () => ({
        DATABASE_URL: "postgresql://test:test@localhost/leadiva_test",
      }),
    }));

    const first = await import("./transaction");
    const firstPool = first.transactionDb.$client;
    expect(firstPool.totalCount).toBe(0);

    vi.resetModules();
    const second = await import("./transaction");

    expect(second.transactionDb).toBe(first.transactionDb);
    expect(second.transactionDb.$client).toBe(firstPool);
    expect(transactionGlobal.leadivaTransactionPool).toBe(firstPool);
    expect(firstPool.totalCount).toBe(0);
  });
});
