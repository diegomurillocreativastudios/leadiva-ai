import { describe, expect, it } from "vitest";

import {
  isPartialSearchResponse,
  readSearchHttpPayload,
} from "./search-http-response";

describe("search HTTP responses", () => {
  it("classifies 207 as partial so the UI can render a warning toast", () => {
    expect(isPartialSearchResponse(207, "PARTIALLY_COMPLETED")).toBe(true);
    expect(isPartialSearchResponse(200, "COMPLETED")).toBe(false);
  });

  it("handles a non-JSON backend response without exposing its body", async () => {
    const response = new Response("proxy stack trace", {
      status: 502,
      headers: { "content-type": "text/plain" },
    });
    await expect(readSearchHttpPayload(response)).resolves.toEqual({});
  });

  it("drops non-scalar error details before they reach a toast", async () => {
    const response = Response.json({
      error: { stack: "internal" },
      message: ["internal"],
      executionId: "../../admin",
    });
    await expect(readSearchHttpPayload(response)).resolves.toEqual({});
  });
});
