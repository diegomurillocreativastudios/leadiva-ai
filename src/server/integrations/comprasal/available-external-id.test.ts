import { describe, expect, it } from "vitest";

import {
  parseComprasalAvailableExternalId,
  resolveComprasalAvailableProcessId,
} from "./available-external-id";

describe("COMPRASAL available external identity", () => {
  it("parses available:135317", () => {
    expect(parseComprasalAvailableExternalId("available:135317")).toBe(135317);
  });

  it.each([
    "135317",
    "available:0",
    "available:-1",
    "available:1.5",
    "available: 135317",
    "https://www.comprasal.gob.sv/procesos-publicos/135317",
    "",
  ])("rejects invalid identity %s", (externalId) => {
    expect(() => parseComprasalAvailableExternalId(externalId)).toThrow(
      /identity/i,
    );
  });

  it.each(["135317", "process:135317", "award:135317"])(
    "rejects historical identity %s",
    (externalId) => {
      expect(() => parseComprasalAvailableExternalId(externalId)).toThrow();
    },
  );

  it("rejects a contradiction between externalId and rawData.id", () => {
    expect(() =>
      resolveComprasalAvailableProcessId({
        externalId: "available:135317",
        rawData: { id: 135318 },
      }),
    ).toThrow(/contradictory/i);
  });

  it("accepts matching canonical raw data", () => {
    expect(
      resolveComprasalAvailableProcessId({
        externalId: "available:135317",
        rawData: { id: 135317 },
      }),
    ).toBe(135317);
  });
});
