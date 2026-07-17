import { describe, expect, it } from "vitest";

import { preparePrivateBatch } from "@/server/integrations/vertex-ai/prepare";
import type { GroundedCandidate } from "@/server/integrations/vertex-ai/schemas";
import type { DocumentExtractionResult } from "@/server/integrations/vertex-ai/document-extractor";
import type { FetchedDocument } from "@/server/services/web-document-fetcher";
import { WebSearchProviderError, type WebSearchResult } from "./contracts";
import {
  discoverPrivateWeb,
  type PrivateWebDiscoveryBudget,
} from "./discover-private-web";
import { FakeWebSearchProvider } from "./fake-provider";

const plan = {
  globalIntentCount: 2,
  regionalIntentCount: 1,
  intents: [
    { id: "a", family: "explicit_procurement" as const, language: "en" as const, query: "RFP website", priority: 10, regional: false },
    { id: "b", family: "project_solution" as const, language: "es" as const, query: "plataforma proveedor", priority: 9, regional: false },
    { id: "c", family: "regional" as const, language: "es" as const, query: "convocatoria Centroamérica", priority: 8, regional: true },
  ],
};

function budget(overrides: Partial<PrivateWebDiscoveryBudget> = {}): PrivateWebDiscoveryBudget {
  return {
    maxProviderQueries: 8,
    resultsPerQuery: 10,
    maxPagesPerQuery: 1,
    maxProviderResults: 80,
    maxUniqueUrls: 40,
    maxUrlsPerDomain: 3,
    searchConcurrency: 2,
    searchTimeoutMs: 1_000,
    maxConsecutiveEmptyQueries: 2,
    maxFetchDocuments: 15,
    fetchConcurrency: 3,
    fetchTimeoutMs: 1_000,
    maxDocumentBytes: 5_000,
    maxRedirects: 4,
    maxRequestsPerHost: 2,
    fetchUserAgent: "TestBot/1.0",
    robotsCacheTtlMs: 60_000,
    maxPdfPages: 3,
    maxExtractionDocuments: 12,
    extractionConcurrency: 2,
    maxExtractionTokens: 2_000,
    targetCandidates: 8,
    maxEstimatedCost: 0.1,
    providerCostPerRequest: 0.005,
    ...overrides,
  };
}

function searchResult(
  query: string,
  family: string,
  index: number,
  overrides: Partial<WebSearchResult> = {},
): WebSearchResult {
  return {
    title: `Request for proposal website ${index}`,
    url: `https://buyer${index}.example/procurement/rfp-${index}`,
    snippet: "Submit proposal before the deadline for software development",
    domain: `buyer${index}.example`,
    publishedAt: null,
    query,
    queryFamily: family,
    rank: index,
    provider: "FAKE",
    ...overrides,
  };
}

function fetched(url: string, links: string[] = []): FetchedDocument {
  return {
    requestedUrl: url,
    finalUrl: url,
    canonicalUrl: null,
    contentType: url.endsWith(".pdf") ? "application/pdf" : "text/html",
    statusCode: 200,
    title: "RFP document",
    text: "Request for proposal for software development. Submit proposal.",
    links,
    byteLength: 100,
    fetchedAt: "2026-07-16T00:00:00.000Z",
    pdfPagesProcessed: url.endsWith(".pdf") ? 1 : 0,
  };
}

function extraction(
  document: FetchedDocument,
  deadlineAt: string | null = null,
): DocumentExtractionResult {
  const candidate: GroundedCandidate = {
    title: `Software project ${new URL(document.finalUrl).pathname}`,
    organizationName: `Buyer ${new URL(document.finalUrl).hostname}`,
    sourceUrl: document.canonicalUrl ?? document.finalUrl,
    snippet: "Request for proposal for software development",
    category: "SOFTWARE",
    countryCode: null,
    workMode: "UNKNOWN",
    contractingSector: "PRIVATE",
    estimatedAmount: null,
    currency: null,
    deadlineAt,
  };
  return {
    candidates: [candidate],
    drafts: [],
    outputItems: 1,
    schemaValidCandidatesBeforeDeduplication: 1,
    schemaInvalidCandidates: 0,
    inputTokens: 100,
    outputTokens: 50,
    finishReason: "STOP",
    durationMs: 1,
    failureKind: null,
    model: "test-model",
    promptVersion: "test-v1",
  };
}

function successProvider(resolveResults: (query: string, family: string) => WebSearchResult[]) {
  return new FakeWebSearchProvider((request, family) => ({
    results: resolveResults(request.query, family),
    provider: "FAKE",
    requestCount: 1,
    retryCount: 0,
    durationMs: 1,
    exhausted: true,
  }));
}

describe("discoverPrivateWeb", () => {
  it("runs independent planner intents with bounded concurrency", async () => {
    let active = 0;
    let peak = 0;
    const provider = new FakeWebSearchProvider(async (request, family) => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      return {
        results: [searchResult(request.query, family, family === "regional" ? 3 : family === "project_solution" ? 2 : 1)],
        provider: "FAKE",
        requestCount: 1,
        retryCount: 0,
        durationMs: 1,
        exhausted: true,
      };
    });
    const result = await discoverPrivateWeb({
      executionId: "execution",
      searchPlan: plan,
      provider,
      budget: budget({ searchConcurrency: 2 }),
      deps: {
        fetchDocument: async (url) => ({ ok: true, document: fetched(url), robotsFromCache: false }),
        extractDocument: async (document) => extraction(document),
      },
    });
    expect(peak).toBeLessThanOrEqual(2);
    expect(result.metrics.searchProviderQueriesExecuted).toBe(3);
    expect(result.batch.candidates).toHaveLength(3);
  });

  it("keeps successful queries when another query fails", async () => {
    const provider = new FakeWebSearchProvider((request, family) => {
      if (family === "project_solution") {
        throw new WebSearchProviderError("PROVIDER_REQUEST_FAILED", "temporary", { attempts: 1 });
      }
      return {
        results: [searchResult(request.query, family, family === "regional" ? 3 : 1)],
        provider: "FAKE",
        requestCount: 1,
        retryCount: 0,
        durationMs: 1,
        exhausted: true,
      };
    });
    const result = await discoverPrivateWeb({
      executionId: "execution",
      searchPlan: plan,
      provider,
      budget: budget(),
      deps: {
        fetchDocument: async (url) => ({ ok: true, document: fetched(url), robotsFromCache: false }),
        extractDocument: async (document) => extraction(document),
      },
    });
    expect(result.metrics.searchProviderErrors.PROVIDER_REQUEST_FAILED).toBe(1);
    expect(result.batch.candidates.length).toBeGreaterThan(0);
  });

  it("stops explicitly on provider configuration/authentication failures", async () => {
    const provider = new FakeWebSearchProvider(() => {
      throw new WebSearchProviderError("PROVIDER_NOT_CONFIGURED", "missing", { attempts: 0 });
    });
    const result = await discoverPrivateWeb({
      executionId: "execution",
      searchPlan: plan,
      provider,
      budget: budget(),
    });
    expect(result.operationalError?.code).toBe("PROVIDER_NOT_CONFIGURED");
    expect(result.metrics.stoppedBy).toBe("PROVIDER_NOT_CONFIGURED");
    expect(result.batch.candidates).toEqual([]);
  });

  it("respects provider cost, document and target limits", async () => {
    const provider = successProvider((query, family) =>
      Array.from({ length: 4 }, (_, index) => searchResult(query, family, index + 1)),
    );
    const result = await discoverPrivateWeb({
      executionId: "execution",
      searchPlan: plan,
      provider,
      budget: budget({
        maxEstimatedCost: 0.011,
        providerCostPerRequest: 0.005,
        maxFetchDocuments: 2,
        maxExtractionDocuments: 2,
        targetCandidates: 1,
        extractionConcurrency: 1,
      }),
      deps: {
        fetchDocument: async (url) => ({ ok: true, document: fetched(url), robotsFromCache: false }),
        extractDocument: async (document) => extraction(document),
      },
    });
    expect(result.metrics.searchProviderRequests).toBeLessThanOrEqual(2);
    expect(result.metrics.documentsFetchAttempted).toBeLessThanOrEqual(2);
    expect(result.batch.candidates).toHaveLength(1);
  });

  it("uses diverse, classified results and follows an aggregator's official link", async () => {
    const provider = successProvider((query, family) => [
      ...Array.from({ length: 4 }, (_, index) =>
        searchResult(query, family, index + 1, {
          domain: "same.example",
          url: `https://same.example/procurement/rfp-${index + 1}`,
        }),
      ),
      searchResult(query, family, 10, {
        title: "Software job opening",
        url: "https://jobs.example/careers/software",
        domain: "jobs.example",
      }),
      searchResult(query, family, 11, {
        title: "Software training course",
        url: "https://academy.example/course/software",
        domain: "academy.example",
      }),
      searchResult(query, family, 12, {
        title: "Request for proposal shared on LinkedIn",
        url: "https://linkedin.com/posts/example-rfp",
        domain: "linkedin.com",
      }),
      searchResult(query, family, 13, {
        title: "Official terms of reference PDF",
        url: "https://ngo.example/terms.pdf",
        domain: "ngo.example",
      }),
      searchResult(query, family, 14, {
        url: "https://ngo.example/terms.pdf?utm_source=duplicate",
        domain: "ngo.example",
      }),
    ]);
    const result = await discoverPrivateWeb({
      executionId: "execution",
      searchPlan: { ...plan, intents: plan.intents.slice(0, 1), regionalIntentCount: 0, globalIntentCount: 1 },
      provider,
      budget: budget({ maxFetchDocuments: 8 }),
      deps: {
        fetchDocument: async (url) => ({
          ok: true,
          document: fetched(
            url,
            url.includes("linkedin.com")
              ? ["https://official.example/procurement/rfp.pdf"]
              : [],
          ),
          robotsFromCache: false,
        }),
        extractDocument: async (document) => extraction(document),
      },
    });
    expect(result.selectedResults.filter((item) => item.domain === "same.example")).toHaveLength(3);
    expect(result.metrics.resultsRejectedByRetrievalClassifier).toBeGreaterThanOrEqual(2);
    expect(result.metrics.crossQueryDuplicates).toBeGreaterThanOrEqual(1);
    expect(result.documents.some((item) => item.sourceRelationship === "LINKED_OFFICIAL")).toBe(true);
  });

  it("does not turn an aggregator index page into a final candidate without an official link", async () => {
    const provider = successProvider((query, family) => [
      searchResult(query, family, 1, {
        title: "Licitaciones desarrollo software",
        url: "https://tendios.com/licitaciones/desarrollo-software",
        domain: "tendios.com",
        snippet: "Listado de licitaciones de desarrollo de software",
      }),
    ]);
    const result = await discoverPrivateWeb({
      executionId: "execution",
      searchPlan: {
        ...plan,
        intents: plan.intents.slice(0, 1),
        regionalIntentCount: 0,
        globalIntentCount: 1,
      },
      provider,
      budget: budget({ maxFetchDocuments: 4 }),
      deps: {
        fetchDocument: async (url) => ({
          ok: true,
          document: fetched(url, []),
          robotsFromCache: false,
        }),
        extractDocument: async (document) => extraction(document),
      },
    });
    expect(result.batch.candidates).toHaveLength(0);
    expect(
      result.diagnosticTraces?.some(
        (trace) => trace.reasonCode === "AGGREGATOR_INDEX_PAGE",
      ),
    ).toBe(true);
    expect(
      result.diagnosticTraces?.some(
        (trace) => trace.reasonCode === "OFFICIAL_LINK_NOT_FOUND",
      ),
    ).toBe(true);
  });

  it("can create a candidate from an official link found on an aggregator page", async () => {
    const provider = successProvider((query, family) => [
      searchResult(query, family, 1, {
        title: "Licitaciones desarrollo software",
        url: "https://tendios.com/licitaciones/desarrollo-software",
        domain: "tendios.com",
        snippet: "Listado de licitaciones de desarrollo de software",
      }),
    ]);
    const result = await discoverPrivateWeb({
      executionId: "execution",
      searchPlan: {
        ...plan,
        intents: plan.intents.slice(0, 1),
        regionalIntentCount: 0,
        globalIntentCount: 1,
      },
      provider,
      budget: budget({ maxFetchDocuments: 4 }),
      deps: {
        fetchDocument: async (url) => ({
          ok: true,
          document: fetched(
            url,
            url.includes("tendios.com")
              ? ["https://buyer.example/procurement/rfp-software-2026"]
              : [],
          ),
          robotsFromCache: false,
        }),
        extractDocument: async (document) => extraction(document),
      },
    });
    expect(
      result.documents.some((item) => item.sourceRelationship === "LINKED_OFFICIAL"),
    ).toBe(true);
    expect(result.batch.candidates.length).toBeGreaterThanOrEqual(1);
    expect(
      result.batch.candidates.every(
        (candidate) => !candidate.sourceUrl.includes("tendios.com"),
      ),
    ).toBe(true);
  });

  it("exposes reconciliable pre- and post-deduplication metrics", async () => {
    const provider = successProvider((query, family) => [
      searchResult(query, family, 1),
      searchResult(query, family, 2),
      searchResult(query, family, 3, {
        url: "https://buyer1.example/procurement/rfp-1?utm=dup",
        domain: "buyer1.example",
      }),
    ]);
    let extractionCalls = 0;
    const result = await discoverPrivateWeb({
      executionId: "execution",
      searchPlan: {
        ...plan,
        intents: plan.intents.slice(0, 1),
        regionalIntentCount: 0,
        globalIntentCount: 1,
      },
      provider,
      budget: budget(),
      deps: {
        fetchDocument: async (url) => ({
          ok: true,
          document: fetched(url),
          robotsFromCache: false,
        }),
        extractDocument: async (document) => {
          extractionCalls += 1;
          const base = extraction(document);
          // Force a duplicate identity across two documents.
          if (extractionCalls === 2) {
            return {
              ...base,
              candidates: [
                {
                  ...base.candidates[0]!,
                  title: base.candidates[0]!.title,
                  organizationName: "Same Org",
                  sourceUrl: "https://other.example/procurement/rfp-dup",
                },
              ],
              drafts: base.drafts,
              outputItems: 1,
              schemaValidCandidatesBeforeDeduplication: 1,
              schemaInvalidCandidates: 0,
            };
          }
          return {
            ...base,
            candidates: [
              {
                ...base.candidates[0]!,
                organizationName: "Same Org",
              },
            ],
            outputItems: 1,
            schemaValidCandidatesBeforeDeduplication: 1,
            schemaInvalidCandidates: 0,
          };
        },
      },
    });

    expect(result.metrics.normalizationOutputItems).toBe(
      result.metrics.schemaValidCandidatesBeforeDeduplication +
        result.metrics.schemaInvalidCandidates,
    );
    expect(result.metrics.uniqueNormalizedCandidates).toBeLessThanOrEqual(
      result.metrics.schemaValidCandidatesBeforeDeduplication,
    );
    expect(
      result.metrics.schemaValidCandidatesBeforeDeduplication -
        result.metrics.uniqueNormalizedCandidates,
    ).toBeGreaterThanOrEqual(0);
    expect(result.metrics.providerSearchDurationMs).toBeTypeOf("number");
    expect(result.metrics.documentFetchDurationMs).toBeTypeOf("number");
    expect(result.metrics.extractionDurationMs).toBeTypeOf("number");
    expect(result.metrics.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("a failed document does not remove other extractions and candidates still enter current filters", async () => {
    let extractionIndex = 0;
    const provider = successProvider((query, family) => [
      searchResult(query, family, 1),
      searchResult(query, family, 2),
      searchResult(query, family, 3),
    ]);
    const result = await discoverPrivateWeb({
      executionId: "execution",
      searchPlan: { ...plan, intents: plan.intents.slice(0, 1), regionalIntentCount: 0, globalIntentCount: 1 },
      provider,
      budget: budget(),
      deps: {
        fetchDocument: async (url) =>
          url.includes("buyer2")
            ? { ok: false, code: "TIMEOUT", detail: "timeout" }
            : { ok: true, document: fetched(url), robotsFromCache: false },
        extractDocument: async (document) => {
          extractionIndex += 1;
          return extraction(
            document,
            extractionIndex === 1
              ? "2025-01-01T00:00:00.000Z"
              : null,
          );
        },
      },
    });
    expect(result.metrics.documentsFetchFailed).toBe(1);
    expect(result.batch.candidates).toHaveLength(2);

    const prepared = preparePrivateBatch({
      sourceType: "PRIVATE_WEB",
      candidates: result.batch.candidates,
      query: "RFP website",
      groundingSources: result.batch.sources,
      now: new Date("2026-07-16T00:00:00Z"),
    });
    expect(prepared.discardCounts.EXPIRED).toBe(1);
    expect(prepared.accepted).toHaveLength(1);
  });
});
