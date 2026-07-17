import { describe, expect, it } from "vitest";

import {
  classifyNormalizationFailure,
  countUniqueDomains,
  limitCandidateTraces,
  resolveCandidatesFound,
  resolvePrivateSearchOutcome,
  resolveProviderSearchOutcome,
  resolveQueriesExecuted,
  shouldPersistVerifiedCandidate,
  truncateDiagnosticText,
  type CandidateTrace,
} from "./pipeline-metrics";
import { partitionStructuredCandidates } from "./structure-candidates";

describe("resolveCandidatesFound", () => {
  it("uses schema-valid normalized candidates, not created+updated", () => {
    expect(resolveCandidatesFound({ schemaValidCandidates: 5 })).toBe(5);
    expect(resolveCandidatesFound({ schemaValidCandidates: 0 })).toBe(0);
  });
});

describe("private catalog persistence boundary", () => {
  it("persists verified candidates and keeps rejected or partial candidates out of search_results", () => {
    expect(shouldPersistVerifiedCandidate("VERIFIED")).toBe(true);
    expect(shouldPersistVerifiedCandidate("PARTIALLY_VERIFIED")).toBe(false);
    expect(shouldPersistVerifiedCandidate("REJECTED")).toBe(false);
  });
});

describe("resolveProviderSearchOutcome", () => {
  const base = {
    operationalErrorCode: null,
    stoppedBy: null,
    providerResults: 10,
    uniqueUrls: 8,
    selectedForFetch: 5,
    documentsFetchAttempted: 5,
    documentsFetchSucceeded: 4,
    documentsSentToExtraction: 4,
    documentsExtracted: 4,
    extractionFailures: 0,
    candidatesFound: 3,
    candidatesFiltered: 0,
    candidatesSentToVerification: 3,
    candidatesVerified: 1,
    candidatesCreated: 1,
    candidatesUpdated: 0,
    candidatesUnchanged: 0,
    discardCounts: {},
    providerErrors: {},
  };

  it("distinguishes provider configuration, empty discovery, fetch and extraction", () => {
    expect(
      resolveProviderSearchOutcome({
        ...base,
        operationalErrorCode: "PROVIDER_NOT_CONFIGURED",
      }),
    ).toBe("PROVIDER_NOT_CONFIGURED");
    expect(
      resolveProviderSearchOutcome({ ...base, providerResults: 0 }),
    ).toBe("COMPLETED_NO_PROVIDER_RESULTS");
    expect(
      resolveProviderSearchOutcome({
        ...base,
        documentsFetchSucceeded: 0,
      }),
    ).toBe("COMPLETED_NO_FETCHABLE_DOCUMENTS");
    expect(
      resolveProviderSearchOutcome({
        ...base,
        documentsExtracted: 0,
        extractionFailures: 4,
      }),
    ).toBe("FAILED_EXTRACTION");
    expect(
      resolveProviderSearchOutcome({
        ...base,
        stoppedBy: "FAILED_DOCUMENT_FETCH",
        documentsFetchSucceeded: 0,
      }),
    ).toBe("FAILED_DOCUMENT_FETCH");
  });
});

describe("resolveQueriesExecuted", () => {
  it("prefers real webSearchQueries metadata", () => {
    expect(
      resolveQueriesExecuted({
        webSearchQueriesCount: 4,
        fallbackQueryCount: 2,
      }),
    ).toEqual({
      queriesExecuted: 4,
      queriesExecutedEstimated: false,
    });
  });

  it("marks fallback as estimated when metadata is empty", () => {
    expect(
      resolveQueriesExecuted({
        webSearchQueriesCount: 0,
        fallbackQueryCount: 3,
      }),
    ).toEqual({
      queriesExecuted: 3,
      queriesExecutedEstimated: true,
    });
  });
});

describe("resolvePrivateSearchOutcome — pipeline cases", () => {
  it("case 1: no grounding chunks → COMPLETED_NO_GROUNDING_SOURCES and candidatesFound=0", () => {
    const candidatesFound = resolveCandidatesFound({
      schemaValidCandidates: 0,
    });
    const outcome = resolvePrivateSearchOutcome({
      configured: true,
      groundingSourcesFound: 0,
      discoveryTextLength: 0,
      candidatesFound,
      candidatesFiltered: 0,
      candidatesSentToVerification: 0,
      candidatesVerified: 0,
      candidatesCreated: 0,
      candidatesUpdated: 0,
      candidatesUnchanged: 0,
      discardCounts: {},
    });

    expect(candidatesFound).toBe(0);
    expect(outcome).toBe("COMPLETED_NO_GROUNDING_SOURCES");
  });

  it("case 2: grounding sources present but empty normalized array", () => {
    const candidatesFound = resolveCandidatesFound({
      schemaValidCandidates: 0,
    });
    const outcome = resolvePrivateSearchOutcome({
      configured: true,
      groundingSourcesFound: 7,
      discoveryTextLength: 900,
      candidatesFound,
      candidatesFiltered: 0,
      candidatesSentToVerification: 0,
      candidatesVerified: 0,
      candidatesCreated: 0,
      candidatesUpdated: 0,
      candidatesUnchanged: 0,
      discardCounts: {},
    });

    expect(candidatesFound).toBe(0);
    expect(outcome).toBe("COMPLETED_NO_NORMALIZED_CANDIDATES");
  });

  it("case 3: five candidates all filtered", () => {
    const candidatesFound = resolveCandidatesFound({
      schemaValidCandidates: 5,
    });
    const outcome = resolvePrivateSearchOutcome({
      configured: true,
      groundingSourcesFound: 5,
      discoveryTextLength: 1200,
      candidatesFound,
      candidatesFiltered: 5,
      candidatesSentToVerification: 0,
      candidatesVerified: 0,
      candidatesCreated: 0,
      candidatesUpdated: 0,
      candidatesUnchanged: 0,
      discardCounts: {
        EXPIRED: 3,
        IRRELEVANT: 2,
      },
    });

    expect(candidatesFound).toBe(5);
    expect(outcome).toBe("COMPLETED_ALL_FILTERED");
  });

  it("case 4: two candidates reach persistence unchanged", () => {
    const candidatesFound = resolveCandidatesFound({
      schemaValidCandidates: 2,
    });
    const outcome = resolvePrivateSearchOutcome({
      configured: true,
      groundingSourcesFound: 4,
      discoveryTextLength: 800,
      candidatesFound,
      candidatesFiltered: 0,
      candidatesSentToVerification: 2,
      candidatesVerified: 2,
      candidatesCreated: 0,
      candidatesUpdated: 0,
      candidatesUnchanged: 2,
      discardCounts: {},
    });

    expect(candidatesFound).toBe(2);
    expect(outcome).toBe("COMPLETED_ALL_UNCHANGED");
  });

  it("case 5: one created and one updated", () => {
    const candidatesFound = resolveCandidatesFound({
      schemaValidCandidates: 2,
    });
    const outcome = resolvePrivateSearchOutcome({
      configured: true,
      groundingSourcesFound: 3,
      discoveryTextLength: 700,
      candidatesFound,
      candidatesFiltered: 0,
      candidatesSentToVerification: 2,
      candidatesVerified: 2,
      candidatesCreated: 1,
      candidatesUpdated: 1,
      candidatesUnchanged: 0,
      discardCounts: {},
    });

    expect(candidatesFound).toBe(2);
    expect(outcome).toBe("COMPLETED_WITH_PERSISTED_RESULTS");
  });

  it("case 6: invalid JSON is a normalization failure, not silent zero candidates", () => {
    expect(classifyNormalizationFailure("AI_RESPONSE_INVALID_JSON")).toBe(
      "INVALID_JSON",
    );
    expect(
      resolvePrivateSearchOutcome({
        configured: true,
        failureStage: "NORMALIZATION",
        groundingSourcesFound: 4,
        discoveryTextLength: 500,
        candidatesFound: 0,
        candidatesFiltered: 0,
        candidatesSentToVerification: 0,
        candidatesVerified: 0,
        candidatesCreated: 0,
        candidatesUpdated: 0,
        candidatesUnchanged: 0,
        discardCounts: {},
      }),
    ).toBe("FAILED_NORMALIZATION");
  });

  it("case 7 helpers: unique domains and truncated diagnostics stay bounded", () => {
    expect(
      countUniqueDomains([
        { domain: "a.com" },
        { domain: "A.com" },
        { uri: "https://b.com/rfp" },
        { uri: "https://b.com/other" },
      ]),
    ).toBe(2);

    expect(truncateDiagnosticText("abcdef", 4)).toBe("abcd…");
    expect(truncateDiagnosticText("ab", 4)).toBe("ab");
  });

  it("limits discarded candidate traces", () => {
    const traces: CandidateTrace[] = Array.from({ length: 40 }, (_, index) => ({
      temporaryId: `t-${index}`,
      stage: "FILTERING",
      outcome: "REJECTED",
      reasonCode: "EXPIRED",
    }));
    expect(limitCandidateTraces(traces, 25)).toHaveLength(25);
  });

  it("case 7: one invalid structured candidate does not discard the batch", () => {
    const result = partitionStructuredCandidates([
      {
        sourceId: "src-1",
        title: "RFP desarrollo de plataforma comercial",
        organizationName: "Acme",
      },
      {
        sourceId: "",
        title: "x",
      },
      {
        sourceId: "src-3",
        title: "Consultoría de inteligencia artificial",
      },
    ]);

    expect(result.valid).toHaveLength(2);
    expect(result.invalidCount).toBe(1);
  });
});
