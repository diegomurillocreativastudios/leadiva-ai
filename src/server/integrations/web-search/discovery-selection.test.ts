import { describe, expect, it } from "vitest";

import { normalizeUrl } from "@/lib/normalization";
import type { WebSearchResult } from "./contracts";
import {
  classifySearchResult,
  deduplicateWebResults,
  selectDiverseResults,
} from "./discovery-selection";

function result(overrides: Partial<WebSearchResult> = {}): WebSearchResult {
  return {
    title: "Request for proposal — Website redesign",
    url: "https://buyer.example/procurement/rfp-1",
    snippet: "Submit proposal before the deadline",
    domain: "buyer.example",
    publishedAt: null,
    query: "website RFP",
    queryFamily: "explicit_procurement",
    rank: 1,
    provider: "FAKE",
    ...overrides,
  };
}

describe("provider URL normalization and deduplication", () => {
  it("removes tracking and fragments but keeps business parameters", () => {
    expect(
      normalizeUrl(
        "https://EXAMPLE.com/rfp/?utm_source=x&ref=y&source=z&id=42#apply",
      ),
    ).toBe("https://example.com/rfp?id=42");
  });

  it("merges duplicate URL and domain/title evidence", () => {
    const deduped = deduplicateWebResults([
      result({ url: "https://buyer.example/rfp?id=1&utm_source=a" }),
      result({ url: "https://buyer.example/rfp?id=1#top", query: "digital tender", queryFamily: "project_solution" }),
      result({ url: "https://buyer.example/another", query: "vendor call" }),
    ]);
    expect(deduped.results).toHaveLength(1);
    expect(deduped.duplicates).toBe(2);
    expect(deduped.results[0]?.discoveredByQueries).toHaveLength(3);
    expect(deduped.results[0]?.duplicateEvidenceCount).toBe(2);
  });
});

describe("retrieval classification", () => {
  it("scores RFPs and procurement pages for fetch", () => {
    expect(classifySearchResult(result()).recommendation).toBe("FETCH");
    expect(
      classifySearchResult(
        result({
          title: "Procurement opportunities RFP",
          snippet: "Request for proposal open now",
          url: "https://ngo.example/procurement/rfp-website-2026",
        }),
      ).recommendation,
    ).toBe("FETCH");
  });

  it("treats bare procurement index pages as aggregators for review, not direct fetch priority", () => {
    const classification = classifySearchResult(
      result({
        title: "Procurement opportunities",
        snippet: null,
        url: "https://ngo.example/procurement",
      }),
    );
    expect(classification.negativeSignals).toContain("aggregator");
    expect(classification.recommendation).toBe("REVIEW");
  });

  it.each([
    ["Software job opening", "career"],
    ["Cloud course", "training program"],
    ["Our services", "software development portfolio"],
  ])("does not select noise: %s", (title, snippet) => {
    expect(
      classifySearchResult(result({ title, snippet, url: "https://vendor.example/about-us" }))
        .recommendation,
    ).toBe("SKIP");
  });

  it("keeps ambiguous results for review", () => {
    const classification = classifySearchResult(
      result({ title: "Seeking digital partner", snippet: null, url: "https://ngo.example/opportunity" }),
    );
    expect(classification.recommendation).toBe("REVIEW");
  });
});

describe("result diversity", () => {
  it("enforces domain caps while distributing families", () => {
    const raw = [
      ...Array.from({ length: 4 }, (_, index) =>
        result({
          title: `RFP ${index} — Buyer ${index}`,
          url: `https://same.example/procurement/${index}`,
          domain: "same.example",
          rank: index + 1,
        }),
      ),
      result({
        title: "Platform RFP — Other buyer",
        url: "https://other.example/rfp",
        domain: "other.example",
        queryFamily: "project_solution",
      }),
    ];
    const deduped = deduplicateWebResults(raw).results;
    const selected = selectDiverseResults(deduped, {
      maxResults: 10,
      maxPerDomain: 3,
    });
    expect(selected.filter((item) => item.domain === "same.example")).toHaveLength(3);
    expect(selected.some((item) => item.queryFamily === "project_solution")).toBe(true);
  });
});
