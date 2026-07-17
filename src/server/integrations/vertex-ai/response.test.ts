import { describe, expect, it } from "vitest";

import {
  candidatesFromGroundingCitations,
  extractGenerateContentText,
  mapPrivateSearchError,
} from "@/server/integrations/vertex-ai/response";

describe("extractGenerateContentText", () => {
  it("prefers response.text when present", () => {
    expect(
      extractGenerateContentText({
        text: "  {\"candidates\":[]}  ",
        candidates: [{ finishReason: "STOP", content: { parts: [] } }],
      }),
    ).toEqual({ text: "{\"candidates\":[]}", finishReason: "STOP" });
  });

  it("falls back to non-thought parts when text is empty", () => {
    expect(
      extractGenerateContentText({
        text: "",
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                { thought: true, text: "thinking…" },
                { text: "{\"candidates\":[{\"title\":\"A\"}]}" },
              ],
            },
          },
        ],
      }),
    ).toEqual({
      text: "{\"candidates\":[{\"title\":\"A\"}]}",
      finishReason: "STOP",
    });
  });
});

describe("candidatesFromGroundingCitations", () => {
  it("builds unique candidates from citations", () => {
    const candidates = candidatesFromGroundingCitations(
      [
        { uri: "https://a.example/rfp", title: "RFP A" },
        { uri: "https://a.example/rfp", title: "dup" },
        { uri: "not-a-url", title: "bad" },
        { uri: "https://b.example/tor", title: "TOR B" },
      ],
      10,
    );

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      title: "RFP A",
      sourceUrl: "https://a.example/rfp",
    });
  });
});

describe("mapPrivateSearchError", () => {
  it("maps AI_RESPONSE_EMPTY to Spanish", () => {
    expect(mapPrivateSearchError("AI_RESPONSE_EMPTY")).toContain("Gemini");
  });

  it("maps quota exhaustion to a clear Spanish message", () => {
    expect(mapPrivateSearchError("AI_RATE_LIMITED")).toContain("Cuota");
    expect(
      mapPrivateSearchError(
        '{"error":{"code":429,"message":"Resource has been exhausted (e.g. check quota).","status":"RESOURCE_EXHAUSTED"}}',
      ),
    ).toContain("Cuota");
  });
});
