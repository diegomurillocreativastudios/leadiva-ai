import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  searchExecutionResults,
  searchProfiles,
  searchResults,
  userSearchResultStates,
} from "./tables";

describe("COMPRASAL execution isolation schema", () => {
  it("defines association and private-state uniqueness plus lookup indexes", () => {
    const association = getTableConfig(searchExecutionResults);
    const privateState = getTableConfig(userSearchResultStates);
    const profiles = getTableConfig(searchProfiles);
    const results = getTableConfig(searchResults);

    expect(association.name).toBe("search_execution_results");
    expect(association.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "search_execution_results_execution_result_uidx",
        "search_execution_results_execution_idx",
        "search_execution_results_result_idx",
      ]),
    );
    expect(association.foreignKeys.map((key) => key.onDelete)).toEqual([
      "cascade",
      "cascade",
    ]);

    expect(privateState.name).toBe("user_search_result_states");
    expect(privateState.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "user_search_result_states_user_result_uidx",
        "user_search_result_states_user_idx",
        "user_search_result_states_result_idx",
      ]),
    );
    expect(profiles.indexes.map((index) => index.config.name)).toContain(
      "search_profiles_user_key_uidx",
    );
    expect(results.indexes.map((index) => index.config.name)).toContain(
      "search_results_comprasal_available_identity_uidx",
    );
  });

  it("backfills legacy execution ownership without deleting legacy data", () => {
    const migration = readFileSync(
      join(process.cwd(), "drizzle/0007_marvelous_thunderbolts.sql"),
      "utf8",
    );
    expect(migration).toContain('INSERT INTO "search_execution_results"');
    expect(migration).toContain(
      `"execution"."metrics"->>'searchProvider' = 'COMPRASAL_AVAILABLE_API'`,
    );
    expect(migration).toContain('"legacy"."search_execution_id" IS NOT NULL');
    expect(migration).toContain("ON CONFLICT");
    expect(migration).not.toMatch(/DELETE\s+FROM\s+"search_results"/i);
    expect(migration).not.toMatch(/INSERT\s+INTO\s+"user_search_result_states"/i);
  });
});
