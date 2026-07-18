import { describe, expect, it } from "vitest";

import { updateProfileSchema } from "@/schemas/auth";

describe("updateProfileSchema", () => {
  it("accepts trimmed names", () => {
    const result = updateProfileSchema.safeParse({
      firstName: "  Diego  ",
      lastName: " Murillo Correa ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        firstName: "Diego",
        lastName: "Murillo Correa",
      });
    }
  });

  it("rejects empty names", () => {
    const result = updateProfileSchema.safeParse({
      firstName: " ",
      lastName: "Murillo",
    });
    expect(result.success).toBe(false);
  });
});
