import { describe, expect, it } from "vitest";

import {
  canReturnExistingLeadToUser,
  getSearchResultConversionError,
} from "./search-result-conversion";

describe("private search-result state", () => {
  it("blocks conversion only for the user whose state is DISMISSED", () => {
    const canonical = {
      sourceType: "COMPRASAL",
      verificationStatus: "VERIFIED",
    };
    expect(
      getSearchResultConversionError({ ...canonical, userState: "DISMISSED" }),
    ).toBe("RESULT_DISMISSED");
    expect(
      getSearchResultConversionError({ ...canonical, userState: null }),
    ).toBeNull();
  });

  it("continues to honor canonical global rejection", () => {
    expect(
      getSearchResultConversionError({
        sourceType: "COMPRASAL",
        verificationStatus: "REJECTED",
        userState: null,
      }),
    ).toBe("RESULT_REJECTED");
  });

  it("never converts a PARTIALLY_VERIFIED private result automatically", () => {
    expect(
      getSearchResultConversionError({
        sourceType: "PRIVATE_WEB",
        verificationStatus: "PARTIALLY_VERIFIED",
        userState: null,
      }),
    ).toBe("RESULT_NOT_VERIFIED");
  });

  it("blocks partial and expired PRIVATE_WEB results at conversion time", () => {
    expect(
      getSearchResultConversionError({
        sourceType: "PRIVATE_WEB",
        verificationStatus: "PARTIALLY_VERIFIED",
        userState: null,
      }),
    ).toBe("RESULT_NOT_VERIFIED");
    expect(
      getSearchResultConversionError({
        sourceType: "PRIVATE_WEB",
        verificationStatus: "VERIFIED",
        userState: null,
        deadlineAt: "2026-07-19T23:59:00-06:00",
        now: new Date("2026-07-20T12:00:00Z"),
      }),
    ).toBe("RESULT_EXPIRED");
    expect(
      getSearchResultConversionError({
        sourceType: "PRIVATE_WEB",
        verificationStatus: "VERIFIED",
        userState: null,
        deadlineAt: "2026-07-20T12:00:00Z",
        now: new Date("2026-07-20T12:00:00Z"),
      }),
    ).toBe("RESULT_EXPIRED");
  });

  it("never returns an existing lead owned by another user", () => {
    expect(canReturnExistingLeadToUser("user-a", "user-a")).toBe(true);
    expect(canReturnExistingLeadToUser("user-b", "user-a")).toBe(false);
    expect(canReturnExistingLeadToUser(null, "user-a")).toBe(false);
  });
});
