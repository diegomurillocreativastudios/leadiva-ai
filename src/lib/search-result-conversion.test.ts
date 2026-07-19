import { describe, expect, it } from "vitest";

import { getSearchResultConversionError } from "./search-result-conversion";

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
});
