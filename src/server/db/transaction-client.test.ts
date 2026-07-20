import {
  Pool,
  type PoolClient,
  type QueryConfig,
} from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createTransactionDatabase } from "./transaction-client";

function queryText(query: string | QueryConfig): string {
  return typeof query === "string" ? query : query.text;
}

function transactionalPool() {
  const pool = new Pool({
    connectionString: "postgresql://test:test@localhost/leadiva_test",
  });
  const release = vi.fn();
  const query = vi.fn(async (queryConfig: string | QueryConfig) => ({
    command: "",
    rowCount: 0,
    oid: 0,
    fields: [],
    rows: queryText(queryConfig).includes("transaction_ok")
      ? [{ transaction_ok: 1 }]
      : [],
  }));
  const client = { query, release } as unknown as PoolClient;
  vi.spyOn(pool, "connect").mockImplementation(async () => client);
  return { pool, query, release };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Neon serverless transaction client", () => {
  it("runs an advisory lock and subsequent work in one interactive transaction", async () => {
    const { pool, query, release } = transactionalPool();
    const database = createTransactionDatabase(pool);

    const result = await database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(987654321)`);
      return tx.execute<{ transaction_ok: number }>(
        sql`select 1 as transaction_ok`,
      );
    });

    const statements = query.mock.calls.map(([queryConfig]) =>
      queryText(queryConfig).trim().toLowerCase(),
    );
    expect(statements).toEqual([
      "begin",
      "select pg_advisory_xact_lock(987654321)",
      "select 1 as transaction_ok",
      "commit",
    ]);
    expect(result.rows).toEqual([{ transaction_ok: 1 }]);
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back and releases the pooled connection when the callback fails", async () => {
    const { pool, query, release } = transactionalPool();
    const database = createTransactionDatabase(pool);

    await expect(
      database.transaction(async (tx) => {
        await tx.execute(sql`select 1 as transaction_ok`);
        throw new Error("forced transaction failure");
      }),
    ).rejects.toThrow("forced transaction failure");

    const statements = query.mock.calls.map(([queryConfig]) =>
      queryText(queryConfig).trim().toLowerCase(),
    );
    expect(statements).toEqual([
      "begin",
      "select 1 as transaction_ok",
      "rollback",
    ]);
    expect(release).toHaveBeenCalledOnce();
  });
});
