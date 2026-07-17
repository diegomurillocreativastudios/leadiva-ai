import { describe, expect, it } from "vitest";

import type { FetchedDocument } from "@/server/services/web-document-fetcher";
import { extractOpportunitiesFromDocument } from "./document-extractor";

const document: FetchedDocument = {
  requestedUrl: "https://buyer.example/rfp",
  finalUrl: "https://buyer.example/rfp",
  canonicalUrl: null,
  contentType: "text/html",
  statusCode: 200,
  title: "Website RFP",
  text: "Acme requests proposals for a website redesign. Deadline 2026-08-01.",
  links: [],
  byteLength: 100,
  fetchedAt: "2026-07-16T00:00:00.000Z",
  pdfPagesProcessed: 0,
};

function generation(candidates: unknown[], usage = true) {
  return async () => ({
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: [{ text: JSON.stringify({ candidates }) }] },
      },
    ],
    usageMetadata: usage
      ? { promptTokenCount: 100, candidatesTokenCount: 50 }
      : undefined,
  });
}

function complete(overrides: Record<string, unknown> = {}) {
  return {
    title: "Website redesign RFP",
    organizationName: "Acme Foundation",
    organizationType: "FOUNDATION",
    summary: "Redesign and host the public website",
    requestedServices: ["UX/UI", "development"],
    technologies: ["WordPress"],
    publishedAt: "2026-07-10",
    deadlineAt: "2026-08-01",
    timezone: null,
    budgetAmount: null,
    currency: null,
    amountStatus: "NOT_PUBLISHED",
    applicationMethod: "Email proposal",
    applicationUrl: null,
    geographicRestrictions: [],
    contractingSignals: ["submit proposal"],
    category: "SOFTWARE",
    countryCode: null,
    workMode: "UNKNOWN",
    contractingSector: "PRIVATE",
    evidence: [
      {
        field: "deadline",
        text: "Deadline 2026-08-01",
        url: document.finalUrl,
      },
    ],
    confidence: "HIGH",
    ...overrides,
  };
}

describe("document extraction", () => {
  it("extracts a complete draft with deterministic structured generation", async () => {
    let captured: { config?: Record<string, unknown>; contents?: string } = {};
    const result = await extractOpportunitiesFromDocument(
      { document, maxOutputTokens: 6_000 },
      {
        model: "test-model",
        generateContent: async (request) => {
          captured = request;
          return generation([complete()])();
        },
      },
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.deadlineAt).toBe("2026-08-01T00:00:00.000Z");
    expect(captured.config).toMatchObject({ temperature: 0, maxOutputTokens: 6_000 });
    expect(captured.config).not.toHaveProperty("tools");
    expect(captured.contents).not.toContain('"properties"');
  });

  it("keeps candidates without date or budget", async () => {
    const result = await extractOpportunitiesFromDocument(
      { document, maxOutputTokens: 2_000 },
      { generateContent: generation([complete({ deadlineAt: null, budgetAmount: null })]), model: "test" },
    );
    expect(result.candidates[0]).toMatchObject({ deadlineAt: null, estimatedAmount: null });
  });

  it("keeps valid items when another item cannot become canonical", async () => {
    const result = await extractOpportunitiesFromDocument(
      { document, maxOutputTokens: 2_000 },
      { generateContent: generation([complete(), complete({ title: null })]), model: "test" },
    );
    expect(result.outputItems).toBe(2);
    expect(result.schemaValidCandidatesBeforeDeduplication).toBe(1);
    expect(result.schemaInvalidCandidates).toBe(1);
  });

  it("allows an irrelevant document to return no candidates", async () => {
    const result = await extractOpportunitiesFromDocument(
      { document, maxOutputTokens: 2_000 },
      { generateContent: generation([]), model: "test" },
    );
    expect(result.candidates).toEqual([]);
    expect(result.failureKind).toBeNull();
  });
});
