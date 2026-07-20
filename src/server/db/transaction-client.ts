import "server-only";

import type { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import * as schema from "./schema";

export function createTransactionDatabase(pool: Pool) {
  return drizzle(pool, { schema });
}

export type TransactionDatabase = ReturnType<
  typeof createTransactionDatabase
>;
