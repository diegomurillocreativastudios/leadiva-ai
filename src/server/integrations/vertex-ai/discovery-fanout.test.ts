import { describe, expect, it } from "vitest";

import {
  chunkDiscoveryQueries,
  deduplicateDiscoveryCandidates,
  mapWithConcurrency,
  mergeDiscoveryPasses,
} from "@/server/integrations/vertex-ai/discovery-fanout";

describe("chunkDiscoveryQueries", () => {
  it("splits queries into batches of two", () => {
    expect(chunkDiscoveryQueries(["a", "b", "c", "d", "e"], 2)).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e"],
    ]);
  });
});

describe("deduplicateDiscoveryCandidates", () => {
  it("keeps one URL and recognizes organization/title equivalents", () => {
    const result = deduplicateDiscoveryCandidates([
      { title: "Website redesign", organizationName: "Acme", sourceUrl: "https://acme.example/rfp", workMode: "UNKNOWN", contractingSector: "UNKNOWN" },
      { title: "Website redesign", organizationName: "Acme", sourceUrl: "https://acme.example/portal", workMode: "UNKNOWN", contractingSector: "UNKNOWN" },
      { title: "Hosting", organizationName: "Acme", sourceUrl: "https://acme.example/hosting", workMode: "UNKNOWN", contractingSector: "UNKNOWN" },
    ]);
    expect(result.candidates).toHaveLength(2);
    expect(result.duplicates).toBe(1);
  });
});

describe("mapWithConcurrency", () => {
  it("never exceeds its concurrency limit and preserves order", async () => {
    let active = 0;
    let peak = 0;
    const values = await mapWithConcurrency([1, 2, 3, 4], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      return value * 2;
    });
    expect(peak).toBeLessThanOrEqual(2);
    expect(values).toEqual([2, 4, 6, 8]);
  });
});

describe("mergeDiscoveryPasses", () => {
  it("merges sources, text, and usage from multiple passes", () => {
    const merged = mergeDiscoveryPasses([
      {
        text: "[OPPORTUNITY]\nTitle: A\n[/OPPORTUNITY]",
        finishReason: "STOP",
        sources: [
          {
            url: "https://buyer.example/rfp-a",
            normalizedUrl: "https://buyer.example/rfp-a",
            equivalenceKey: "buyer.example/rfp-a",
            title: "RFP A",
            domain: "buyer.example",
            supportCount: 1,
            maxConfidence: 0.8,
          },
        ],
        searchQueries: ["software RFP 2026"],
        usage: { inputTokens: 100, outputTokens: 50 },
        model: "gemini-2.5-flash",
        passIndex: 0,
        queriesInPass: ["software RFP 2026"],
      },
      {
        text: "[OPPORTUNITY]\nTitle: B\n[/OPPORTUNITY]",
        finishReason: "STOP",
        sources: [
          {
            url: "https://buyer.example/rfp-b",
            normalizedUrl: "https://buyer.example/rfp-b",
            equivalenceKey: "buyer.example/rfp-b",
            title: "RFP B",
            domain: "buyer.example",
            supportCount: 1,
            maxConfidence: 0.7,
          },
        ],
        searchQueries: ["software RFP 2026", "IT vendor RFP"],
        usage: { inputTokens: 120, outputTokens: 40 },
        model: "gemini-2.5-flash",
        passIndex: 1,
        queriesInPass: ["IT vendor RFP"],
      },
    ]);

    expect(merged.text).toContain("Title: A");
    expect(merged.text).toContain("Title: B");
    expect(merged.sources).toHaveLength(2);
    expect(merged.searchQueries).toEqual(["software RFP 2026", "IT vendor RFP"]);
    expect(merged.usage).toEqual({ inputTokens: 220, outputTokens: 90 });
  });
});
