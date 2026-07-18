import { describe, expect, it } from "vitest";

import {
  buildSearchExecutionSummary,
  candidateMatchesFilter,
  formatCandidateOutcome,
  formatCandidateReason,
  formatSearchFunnelLine,
  mergeCandidateViews,
  normalizeCandidateTrace,
  type SearchExecutionCandidateView,
} from "./search-execution-activity";
import { describePrivateSearchCatalogEmpty } from "./private-search-labels";

const executionId = "6a29a334-3cb4-4308-891c-d8bc3063ef70";

function candidate(
  overrides: Partial<SearchExecutionCandidateView> = {},
): SearchExecutionCandidateView {
  return {
    temporaryId: "candidate-1",
    executionId,
    searchResultId: null,
    title: "Website redesign opportunity",
    organizationName: "Example Foundation",
    summary: null,
    officialSourceUrl: "https://example.org/rfp",
    applicationUrl: null,
    sourceDomain: "example.org",
    deadlineAt: null,
    category: "SOFTWARE",
    stage: "FILTERING",
    outcome: "FILTERED",
    reasonCode: "IRRELEVANT",
    reason: null,
    retrievalScore: null,
    preliminaryScore: null,
    verificationStatus: null,
    discoveredByQueries: [],
    discoveredByFamilies: [],
    ...overrides,
  };
}

describe("search execution candidate normalization", () => {
  it("adapts historical traces and keeps missing candidate fields nullable", () => {
    const normalized = normalizeCandidateTrace(
      {
        temporaryId: "filter-0",
        stage: "DEDUPLICATION",
        outcome: "REJECTED",
        reasonCode: "DUPLICATE_IN_BATCH",
      },
      executionId,
      0,
    );

    expect(normalized).toMatchObject({
      title: null,
      officialSourceUrl: null,
      stage: "FILTERING",
      outcome: "REJECTED",
      reasonCode: "DUPLICATE_IN_BATCH",
    });
  });

  it("drops unsafe links instead of exposing them to the UI", () => {
    const normalized = normalizeCandidateTrace(
      {
        title: "Unsafe",
        officialSourceUrl: "javascript:alert(1)",
        applicationUrl: "http://localhost/admin",
        stage: "VERIFICATION",
        outcome: "REJECTED",
      },
      executionId,
      0,
    );

    expect(normalized?.officialSourceUrl).toBeNull();
    expect(normalized?.applicationUrl).toBeNull();
  });

  it("maps internal reasons to understandable Spanish labels", () => {
    expect(formatCandidateReason("MISSING_DEADLINE")).toBe(
      "No se pudo confirmar la fecha límite.",
    );
    expect(formatCandidateReason("ROBOTS_DISALLOWED")).toContain(
      "no permitió recuperar",
    );
    expect(formatCandidateReason("PUBLIC_SECTOR")).toMatch(/sector público/i);
    expect(formatCandidateOutcome(candidate())).toBe("Irrelevante");
    expect(
      formatCandidateOutcome(
        candidate({ reasonCode: "PUBLIC_SECTOR", outcome: "FILTERED" }),
      ),
    ).toBe("Sector público");
  });
});

describe("buildSearchExecutionSummary", () => {
  it("reads provider funnel fields from persisted metrics aliases", () => {
    const summary = buildSearchExecutionSummary({
      metrics: {
        searchProviderResults: 20,
        searchProviderUniqueUrls: 20,
        searchProviderUniqueDomains: 17,
        documentsFetchSucceeded: 6,
        documentsExtracted: 3,
        candidatesFound: 1,
        candidatesFiltered: 1,
        candidatesVerified: 0,
        rawCandidatesFound: 3,
        schemaValidCandidates: 2,
        normalizedCandidatesFound: 1,
      },
      candidatesFound: 1,
      candidatesDiscarded: 1,
    });

    expect(summary).toMatchObject({
      providerResults: 20,
      uniqueUrls: 20,
      uniqueDomains: 17,
      documentsFetched: 6,
      documentsExtracted: 3,
      candidatesFound: 1,
      candidatesFiltered: 1,
      candidatesVerified: 0,
      rawCandidatesFound: 3,
      schemaValidCandidates: 2,
      normalizedCandidatesFound: 1,
    });
    expect(formatSearchFunnelLine(summary)).toContain("20 resultados web");
    expect(formatSearchFunnelLine(summary)).toContain("1 filtrado");
  });
});

describe("describePrivateSearchCatalogEmpty", () => {
  it("does not blame verification when everything was filtered", () => {
    const copy = describePrivateSearchCatalogEmpty({
      outcome: "COMPLETED_ALL_FILTERED",
      candidatesFound: 1,
      candidatesVerified: 0,
      candidatesFiltered: 1,
      funnelLine:
        "20 resultados web · 3 docs. analizados · 1 candidato · 1 filtrado · 0 verificados",
      topDiscardLabel: "Sector público (1)",
    });
    expect(copy.description).toContain("20 resultados web");
    expect(copy.description).toContain("Sector público");
    expect(copy.description).not.toMatch(/verificación/i);
  });
});

describe("search execution filters and final state", () => {
  it("separates verified, filtered, rejected and error candidates", () => {
    expect(candidateMatchesFilter(candidate(), "FILTERED")).toBe(true);
    expect(
      candidateMatchesFilter(
        candidate({ outcome: "CREATED", stage: "PERSISTENCE" }),
        "VERIFIED",
      ),
    ).toBe(true);
    expect(
      candidateMatchesFilter(candidate({ outcome: "UNVERIFIED" }), "REJECTED"),
    ).toBe(true);
    expect(
      candidateMatchesFilter(candidate({ outcome: "ERROR" }), "ERROR"),
    ).toBe(true);
  });

  it("merges provider discovery with the later persistence result", () => {
    const merged = mergeCandidateViews([
      candidate({
        temporaryId: "provider-0",
        stage: "FETCH",
        outcome: "SELECTED",
        retrievalScore: 7,
        discoveredByFamilies: ["rfp"],
      }),
      candidate({
        temporaryId: "persist-0",
        stage: "PERSISTENCE",
        outcome: "CREATED",
        reasonCode: null,
        preliminaryScore: 82,
        verificationStatus: "VERIFIED",
      }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      temporaryId: "persist-0",
      stage: "PERSISTENCE",
      outcome: "CREATED",
      retrievalScore: 7,
      preliminaryScore: 82,
      discoveredByFamilies: ["rfp"],
    });
  });

  it("keeps searchResultId when merging a persisted row over a trace", () => {
    const searchResultId = "550e8400-e29b-41d4-a716-446655440000";
    const merged = mergeCandidateViews([
      candidate({
        temporaryId: "persist-0",
        stage: "PERSISTENCE",
        outcome: "CREATED",
        reasonCode: null,
        searchResultId: null,
      }),
      candidate({
        temporaryId: `result-${searchResultId}`,
        stage: "PERSISTENCE",
        outcome: "VERIFIED",
        reasonCode: null,
        searchResultId,
      }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.searchResultId).toBe(searchResultId);
  });
});
