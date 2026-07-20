import "server-only";

import { Pool } from "@neondatabase/serverless";

import { getServerEnv } from "@/env/server";
import {
  createTransactionDatabase,
  type TransactionDatabase,
} from "./transaction-client";

const globalForTransactionDb = globalThis as typeof globalThis & {
  leadivaTransactionPool?: Pool;
  leadivaTransactionDb?: TransactionDatabase;
};

function createTransactionPool() {
  return new Pool({ connectionString: getServerEnv().DATABASE_URL });
}

const transactionPool =
  globalForTransactionDb.leadivaTransactionPool ?? createTransactionPool();

export const transactionDb =
  globalForTransactionDb.leadivaTransactionDb ??
  createTransactionDatabase(transactionPool);

if (process.env.NODE_ENV !== "production") {
  globalForTransactionDb.leadivaTransactionPool = transactionPool;
  globalForTransactionDb.leadivaTransactionDb = transactionDb;
}

export type { TransactionDatabase };
