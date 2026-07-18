import { describe, expect, it } from "vitest";

import {
  deleteSearchExecutionSchema,
  renameSearchExecutionSchema,
} from "@/schemas/search-history";

const executionId = "550e8400-e29b-41d4-a716-446655440000";

describe("search-history schemas", () => {
  it("accepts a valid rename payload", () => {
    expect(
      renameSearchExecutionSchema.parse({
        executionId,
        title: "  Mi búsqueda  ",
      }),
    ).toEqual({
      executionId,
      title: "Mi búsqueda",
    });
  });

  it("rejects an empty rename title", () => {
    expect(
      renameSearchExecutionSchema.safeParse({
        executionId,
        title: "   ",
      }).success,
    ).toBe(false);
  });

  it("accepts a valid delete payload", () => {
    expect(
      deleteSearchExecutionSchema.parse({ executionId }),
    ).toEqual({ executionId });
  });
});
