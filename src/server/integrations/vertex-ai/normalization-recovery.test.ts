import { describe, expect, it } from "vitest";

import {
  adaptNormalizationRoot,
  recoverCandidatesFromRawBlocks,
} from "@/server/integrations/vertex-ai/normalization-recovery";
import { partitionStructuredCandidates } from "@/server/integrations/vertex-ai/structure-candidates";

const sources = [
  {
    url: "https://buyer.example/rfp-a",
    normalizedUrl: "https://buyer.example/rfp-a",
    equivalenceKey: "buyer.example/rfp-a",
    title: "RFP A",
    domain: "buyer.example",
    supportCount: 1,
    maxConfidence: 0.9,
  },
];

describe("normalization root adapter", () => {
  it("accepts opportunities, results, and array roots while recording adaptation", () => {
    expect(adaptNormalizationRoot({ opportunities: [] })).toMatchObject({
      items: [], adapted: true, originalRoot: "opportunities",
    });
    expect(adaptNormalizationRoot({ results: [] })).toMatchObject({
      items: [], adapted: true, originalRoot: "results",
    });
    expect(adaptNormalizationRoot([])).toMatchObject({
      items: [], adapted: true, originalRoot: "array",
    });
  });
});

describe("tolerant item partition", () => {
  it("keeps a valid item when four siblings are malformed", () => {
    const result = partitionStructuredCandidates([
      { sourceId: "source_1", title: "Platform implementation", deadlineAt: "August 2026", category: "free text" },
      { title: "Partial candidate without source" },
      null,
      { sourceId: "source_1" },
      { title: "AB" },
      { sourceId: 4, title: "Bad source" },
    ]);
    expect(result.valid).toHaveLength(2);
    expect(result.valid[1]?.sourceId).toBe("");
    expect(result.invalidCount).toBe(4);
  });
});

describe("raw block recovery", () => {
  it("recovers partial drafts with a real grounded URL", () => {
    const recovered = recoverCandidatesFromRawBlocks({
      rawText: `[OPPORTUNITY]\nTitle: Web platform redesign\nOrganization: Foundation A\nSummary: Redesign a public portal\nDeadline: August 30, 2026\nOfficial source URL: https://untrusted.example/rfp\n[/OPPORTUNITY]`,
      sources,
      maxCandidates: 5,
    });
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({
      title: "Web platform redesign",
      organizationName: "Foundation A",
      sourceUrl: "https://buyer.example/rfp-a",
    });
  });

  it("does not create drafts when there are no grounded sources", () => {
    expect(
      recoverCandidatesFromRawBlocks({
        rawText: "[OPPORTUNITY]\nTitle: A project\n[/OPPORTUNITY]",
        sources: [],
        maxCandidates: 5,
      }),
    ).toEqual([]);
  });
});
