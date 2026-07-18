import { describe, expect, it } from "vitest";

import {
  getUserRoleDescription,
  getUserRoleLabel,
  splitDisplayName,
} from "@/lib/user-role-label";

describe("getUserRoleLabel", () => {
  it("returns Spanish labels for known roles", () => {
    expect(getUserRoleLabel("ADMIN")).toBe("Administrador");
    expect(getUserRoleLabel("USER")).toBe("Usuario");
  });
});

describe("getUserRoleDescription", () => {
  it("includes Leadiva AI branding", () => {
    expect(getUserRoleDescription("ADMIN")).toContain("Administrador");
    expect(getUserRoleDescription("ADMIN")).toContain("Leadiva AI");
  });
});

describe("splitDisplayName", () => {
  it("splits first and remaining name parts", () => {
    expect(splitDisplayName("Diego Murillo Correa")).toEqual({
      firstName: "Diego",
      lastName: "Murillo Correa",
    });
  });

  it("handles a single-word name", () => {
    expect(splitDisplayName("Diego")).toEqual({
      firstName: "Diego",
      lastName: "",
    });
  });
});
