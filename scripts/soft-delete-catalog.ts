import { config } from "dotenv";

config({ path: ".env.local" });

import postgres from "postgres";

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const sql = postgres(databaseUrl, { max: 1 });
  const now = new Date();

  try {
    const results = await sql`
      UPDATE search_results
      SET deleted_at = ${now},
          verification_status = 'REJECTED',
          discard_reason = 'CATALOG_RESET'
      WHERE deleted_at IS NULL
      RETURNING id
    `;

    const opportunities = await sql`
      UPDATE opportunities
      SET deleted_at = ${now},
          status = 'DISCARDED',
          updated_at = ${now},
          next_action = 'CATALOG_RESET'
      WHERE deleted_at IS NULL
      RETURNING id
    `;

    console.log(
      JSON.stringify(
        {
          searchResultsSoftDeleted: results.length,
          opportunitiesSoftDeleted: opportunities.length,
        },
        null,
        2,
      ),
    );
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
