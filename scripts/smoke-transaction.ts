import { config } from "dotenv";
import { sql } from "drizzle-orm";

config({ path: ".env.local", quiet: true });

if (
  process.env.NODE_ENV === "production" ||
  process.env.VERCEL_ENV === "production" ||
  process.env.TRANSACTION_SMOKE_TARGET !== "development"
) {
  throw new Error(
    "Refusing transaction smoke test: confirm a development database with TRANSACTION_SMOKE_TARGET=development.",
  );
}

const { transactionDb } = await import("../src/server/db/transaction");

try {
  const result = await transactionDb.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(987654321)`);
    return tx.execute<{ transaction_ok: number }>(
      sql`select 1 as transaction_ok`,
    );
  });
  console.log({ transaction_ok: result.rows[0]?.transaction_ok === 1 });
} finally {
  await transactionDb.$client.end();
}
