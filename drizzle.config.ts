import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

const databaseUrl =
  process.env.DATABASE_URL_DIRECT?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  process.env.NEON_DB_URL?.trim();

if (!databaseUrl) {
  throw new Error(
    "Set DATABASE_URL, DATABASE_URL_DIRECT, or NEON_DB_URL for drizzle-kit.",
  );
}

export default defineConfig({
  schema: "./src/server/db/schema/tables.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
