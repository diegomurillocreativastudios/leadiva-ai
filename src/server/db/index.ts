import "server-only";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { getServerEnv } from "@/env/server";
import * as schema from "./schema";

const globalForDb = globalThis as typeof globalThis & {
  leadivaDb?: ReturnType<typeof createDb>;
};

function createDb() {
  const env = getServerEnv();
  const sql = neon(env.DATABASE_URL);
  return drizzle(sql, { schema });
}

export const db = globalForDb.leadivaDb ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalForDb.leadivaDb = db;
}

export type Database = typeof db;
