import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const insertedValues: unknown[] = [];
  const updatedValues: unknown[] = [];
  let selectIndex = 0;
  let insertIndex = 0;

  function select() {
    const index = selectIndex;
    selectIndex += 1;
    const chain = {
      from: () => chain,
      innerJoin: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: async () => {
        if (index === 0) {
          return [];
        }
        if (index === 1) {
          return [
            {
              id: "profile-1",
              sourceType: "PRIVATE_WEB",
              keywords: ["software", "rfp"],
              excludedKeywords: [],
              countries: [],
            },
          ];
        }
        return [];
      },
    };
    return chain;
  }

  function insert() {
    const index = insertIndex;
    insertIndex += 1;
    const chain = {
      values: (value: unknown) => {
        insertedValues.push(value);
        return chain;
      },
      returning: async () =>
        index === 0 ? [{ id: "execution-1" }] : [],
    };
    return chain;
  }

  function update() {
    const chain = {
      set: (value: unknown) => {
        updatedValues.push(value);
        return chain;
      },
      where: async () => undefined,
    };
    return chain;
  }

  return {
    db: { select: vi.fn(select), insert: vi.fn(insert), update: vi.fn(update) },
    insertedValues,
    updatedValues,
    discoverPrivateWeb: vi.fn(),
    searchWithGrounding: vi.fn(),
    verifyProviderCandidate: vi.fn(),
    reset() {
      selectIndex = 0;
      insertIndex = 0;
      insertedValues.length = 0;
      updatedValues.length = 0;
      this.db.select.mockClear();
      this.db.insert.mockClear();
      this.db.update.mockClear();
      this.discoverPrivateWeb.mockReset();
      this.searchWithGrounding.mockReset();
      this.verifyProviderCandidate.mockReset();
    },
  };
});

vi.mock("@/server/db", () => ({ db: mocks.db }));
vi.mock("@/server/integrations/web-search/brave-provider", () => ({
  BraveSearchProvider: class {
    readonly name = "BRAVE";
  },
}));
vi.mock("@/server/integrations/web-search/discover-private-web", () => ({
  discoverPrivateWeb: mocks.discoverPrivateWeb,
}));
vi.mock("@/server/integrations/vertex-ai/grounding", () => ({
  searchWithGrounding: mocks.searchWithGrounding,
}));
vi.mock("@/server/integrations/vertex-ai/client", () => ({
  isVertexConfigured: () => true,
}));
vi.mock("@/server/integrations/vertex-ai/verification", () => ({
  verifyGroundedCandidate: vi.fn(),
  verifyProviderCandidate: mocks.verifyProviderCandidate,
}));

function source(url: string, title: string) {
  const parsed = new URL(url);
  return {
    url,
    normalizedUrl: url,
    equivalenceKey: `${parsed.hostname}${parsed.pathname}`,
    title,
    domain: parsed.hostname,
    supportCount: 1,
    maxConfidence: null,
  };
}

describe("provider mode service integration", () => {
  beforeEach(() => {
    mocks.reset();
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost/test");
    vi.stubEnv("AUTH_SECRET", "12345678901234567890123456789012");
    vi.stubEnv("GCP_PROJECT_ID", "test-project");
    vi.stubEnv("PRIVATE_WEB_DISCOVERY_MODE", "PROVIDER_SEARCH");
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "test-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("passes provider drafts through current filters and persists only verified candidates", async () => {
    const currentUrl = "https://current.example/procurement/software-rfp";
    const expiredUrl = "https://expired.example/procurement/software-rfp";
    const current = {
      title: "RFP software platform implementation",
      organizationName: "Current Foundation",
      sourceUrl: currentUrl,
      snippet: "Request for proposal for software development",
      category: "SOFTWARE" as const,
      countryCode: null,
      workMode: "UNKNOWN" as const,
      contractingSector: "PRIVATE" as const,
      estimatedAmount: null,
      currency: null,
      deadlineAt: "2026-08-30T00:00:00.000Z",
    };
    const expired = {
      ...current,
      title: "RFP expired software platform implementation",
      organizationName: "Expired Foundation",
      sourceUrl: expiredUrl,
      deadlineAt: "2025-01-01T00:00:00.000Z",
    };
    const providerMetrics = {
      discoveryMode: "PROVIDER_SEARCH" as const,
      searchProvider: "BRAVE",
      searchProviderQueriesPlanned: 2,
      searchProviderQueriesExecuted: 2,
      searchProviderRequests: 2,
      searchProviderResults: 6,
      searchProviderUniqueUrls: 5,
      searchProviderUniqueDomains: 4,
      searchProviderErrors: {},
      searchProviderRetries: 0,
      resultsByQueryFamily: { explicit_procurement: 4, project_solution: 2 },
      resultsByDomain: { "current.example": 1, "expired.example": 1 },
      crossQueryDuplicates: 1,
      resultsRejectedByRetrievalClassifier: 1,
      resultsSelectedForFetch: 3,
      robotsChecks: 3,
      robotsDisallowed: 0,
      documentsFetchAttempted: 3,
      documentsFetchSucceeded: 2,
      documentsFetchFailed: 1,
      documentsByContentType: { "text/html": 2 },
      documentBytesDownloaded: 2_000,
      pdfDocumentsProcessed: 0,
      pdfDocumentsWithoutText: 0,
      documentsSentToExtraction: 2,
      documentsExtracted: 2,
      extractionFailures: 0,
      extractionTokens: 300,
      extractionInputTokens: 200,
      extractionOutputTokens: 100,
      groundingVerificationRequests: 0,
      groundingVerificationSucceeded: 0,
      groundingVerificationFailed: 0,
      normalizationOutputItems: 2,
      schemaValidCandidatesBeforeDeduplication: 2,
      schemaInvalidCandidates: 0,
      uniqueNormalizedCandidates: 2,
      estimatedProviderCost: 0.01,
      estimatedVertexCost: 0.00006,
      estimatedTotalCost: 0.01006,
      durationMs: 150,
      providerSearchDurationMs: 40,
      documentFetchDurationMs: 60,
      extractionDurationMs: 50,
      stoppedBy: "DISCOVERY_COMPLETE",
    };
    mocks.discoverPrivateWeb.mockResolvedValue({
      batch: {
        candidates: [current, expired],
        citations: [],
        sources: [source(currentUrl, current.title), source(expiredUrl, expired.title)],
        searchQueries: ["RFP software", "platform vendor"],
        inputTokens: 200,
        outputTokens: 100,
        model: "test-model",
        promptVersion: "test-v1",
        configured: true,
      },
      metrics: providerMetrics,
      selectedResults: [],
      documents: [],
      candidateMetadata: [
        {
          title: current.title,
          sourceUrl: currentUrl,
          discoveredByQueries: ["RFP software", "platform vendor"],
          discoveredByFamilies: ["explicit_procurement", "project_solution"],
          sourceRelationship: "DIRECT_OFFICIAL",
          duplicateEvidenceCount: 1,
          publishedAt: "2026-07-10",
          applicationUrl: "https://current.example/apply",
          applicationMethod: "Submit form",
          evidence: [{ field: "deadline", text: "Due August 30" }],
        },
      ],
      operationalError: null,
    });
    mocks.verifyProviderCandidate.mockResolvedValue({
      verification: {
        status: "VERIFIED",
        reason: null,
        originalSourceUrl: currentUrl,
        resolvedSourceUrl: currentUrl,
        sourceTitle: current.title,
        sourceDomain: "current.example",
        sourceIsGrounded: false,
        sourceIsSpecific: true,
        titleConfirmed: true,
        buyerConfirmed: true,
        amountConfirmed: false,
        deadlineConfirmed: true,
        payload: {
          projectName: current.title,
          description: current.snippet,
          buyerName: current.organizationName,
          category: "SOFTWARE",
          amountStatus: "NOT_PUBLISHED",
          amountValue: null,
          amountMin: null,
          amountMax: null,
          amountCurrency: null,
          publicationDate: null,
          deadline: current.deadlineAt,
          sourceTitle: current.title,
          sourceIsSpecific: true,
          isSingleOpportunity: true,
          titleConfirmed: true,
          buyerConfirmed: true,
          amountConfirmed: false,
          deadlineConfirmed: true,
          rejectionReason: null,
          evidence: [],
        },
        evidence: [],
        sourceUrlValidation: { ok: true },
        verifier: "HTTP_FALLBACK",
      },
      groundingRequested: false,
      groundingSucceeded: false,
      groundingInputTokens: 0,
      groundingOutputTokens: 0,
    });

    const { runGroundedSearch } = await import("./service");
    const result = await runGroundedSearch({
      sourceType: "PRIVATE_WEB",
      interestCategories: ["SOFTWARE"],
    });

    expect(mocks.searchWithGrounding).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "COMPLETED",
      discoveryMode: "PROVIDER_SEARCH",
      searchProvider: "BRAVE",
      providerResults: 6,
      uniqueUrls: 5,
      uniqueDomains: 4,
      documentsFetched: 2,
      documentsExtracted: 2,
      candidatesFound: 2,
      candidatesFiltered: 1,
      candidatesVerified: 1,
      candidatesCreated: 1,
      candidatesDiscarded: 1,
    });
    expect(result.discardCounts.EXPIRED).toBe(1);
    expect(mocks.verifyProviderCandidate).toHaveBeenCalledOnce();
    expect(mocks.verifyProviderCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ allowGrounding: true }),
    );
    expect(mocks.insertedValues).toHaveLength(2);
    expect(mocks.insertedValues[1]).toMatchObject({
      rawData: {
        discoveryMetadata: {
          discoveredByQueries: ["RFP software", "platform vendor"],
          sourceRelationship: "DIRECT_OFFICIAL",
        },
      },
    });
  });
});
