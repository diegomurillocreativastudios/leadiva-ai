import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/db/transaction", () => ({ transactionDb: {} }));

import {
  WebSearchProviderError,
  type WebSearchProvider,
  type WebSearchResult,
} from "@/server/integrations/web-search/contracts";
import type { FetchedDocument } from "@/server/services/web-document-fetcher";

import { extractPrivateOpportunityDeterministically } from "./deterministic-extractor";
import { canUseExistingPrivateWebCanonical } from "./persistence";
import {
  PRIVATE_WEB_HARD_LIMITS,
  PrivateWebSearchAdmissionError,
  runPrivateWebSearchWithDependencies,
  type PrivateWebServiceConfig,
  type PrivateWebServiceDependencies,
} from "./service";

const USER_ID = "00000000-0000-4000-8000-000000000401";
const EXECUTION_ID = "00000000-0000-4000-8000-000000000201";

const validText = `
Fundación Innovación Salvadoreña invita a presentar propuestas de proveedores externos.
Convocatoria abierta para empresas y consultores.
Objetivo: desarrollo e implementación de software para la gestión de beneficiarios.
Lugar de ejecución del proyecto: El Salvador.
Fecha límite: 31/12/2027.
Enviar la propuesta al correo compras@fundacion.org.sv.
`;

function fetchedDocument(url: string): FetchedDocument {
  return {
    requestedUrl: url,
    finalUrl: url,
    canonicalUrl: url,
    contentType: "text/html",
    statusCode: 200,
    title: "RFP desarrollo de software",
    text: validText,
    links: [],
    byteLength: new TextEncoder().encode(validText).byteLength,
    fetchedAt: "2026-07-20T12:00:00.000Z",
    pdfPagesProcessed: 0,
  };
}

function config(overrides: Partial<PrivateWebServiceConfig> = {}): PrivateWebServiceConfig {
  return {
    enabled: true,
    apiKey: "test-key",
    maxBraveRequests: 8,
    maxProviderResults: 160,
    maxUniqueUrls: 60,
    maxDocumentFetches: 10,
    maxGeminiExtractions: 6,
    maxResults: 50,
    maxPerDomain: 3,
    maxConcurrentSearchesPerUser: 1,
    maxSearchesPerHour: 5,
    staleExecutionMinutes: 10,
    queryMinCoverage: 0.6,
    totalTimeoutMs: 180_000,
    braveTimeoutMs: 35_000,
    searchRequestTimeoutMs: 1_000,
    searchMaxRetries: 0,
    fetchConcurrency: 3,
    fetchTimeoutMs: 1_000,
    maxDocumentBytes: 5_000_000,
    maxRedirects: 4,
    maxRequestsPerHost: 2,
    fetchUserAgent: "LeadivaTest/1.0",
    robotsCacheTtlMs: 60_000,
    maxRobotsBytes: 500_000,
    maxPdfPages: 30,
    maxGeminiOutputTokens: 2_000,
    braveCostPerRequest: 0.005,
    ...overrides,
  };
}

function result(url: string, query: string, family: string, rank: number): WebSearchResult {
  return {
    title: "Solicitud de propuestas de software",
    url,
    snippet:
      "Solicitud de propuestas para contratar proveedor de desarrollo de software en El Salvador. Fecha límite: 31/12/2027.",
    domain: new URL(url).hostname,
    publishedAt: null,
    age: null,
    extraSnippets: [],
    query,
    queryFamily: family,
    rank,
    provider: "BRAVE",
  };
}

function providerWithResults(count: number): WebSearchProvider {
  return {
    name: "BRAVE",
    isConfigured: () => true,
    search: vi.fn(async (request, context) => ({
      results: Array.from({ length: count }, (_, index) =>
        result(
          `https://buyer${index}.org.sv/convocatorias/rfp-software-${index}`,
          request.query,
          context?.queryFamily ?? "unknown",
          index + 1,
        ),
      ),
      provider: "BRAVE",
      requestCount: 1,
      retryCount: 0,
      durationMs: 1,
      exhausted: true,
      moreResultsAvailable: false,
      queryAltered: null,
    })),
  };
}

function typeScriptSources(directory: URL): URL[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) return typeScriptSources(child);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [child] : [];
  });
}

function dependencies(overrides: Partial<PrivateWebServiceDependencies> = {}) {
  const finishExecution = vi.fn<
    PrivateWebServiceDependencies["repository"]["finishExecution"]
  >(async () => undefined);
  const persistCandidate = vi.fn(async () => ({
    kind: "PERSISTED" as const,
    id: crypto.randomUUID(),
    outcome: "CREATED" as const,
  }));
  const deps: PrivateWebServiceDependencies = {
    repository: {
      startExecution: vi.fn(async () => ({
        kind: "STARTED" as const,
        profileId: "profile-1",
        executionId: EXECUTION_ID,
      })),
      persistCandidate,
      finishExecution,
    },
    provider: providerWithResults(1),
    fetchDocument: vi.fn(async (url) => ({
      ok: true as const,
      document: fetchedDocument(url),
      robotsFromCache: false,
    })),
    deterministicExtractor: extractPrivateOpportunityDeterministically,
    geminiExtractor: vi.fn(async () => ({
      candidates: [],
      inputTokens: 0,
      outputTokens: 0,
      durationMs: 1,
      model: "test",
      promptVersion: "test",
      failureKind: null,
    })),
    vertexConfigured: () => true,
    now: () => new Date("2026-07-20T12:00:00.000Z"),
    ...overrides,
  };
  return { deps, finishExecution, persistCandidate };
}

describe("PRIVATE_WEB Brave-only service", () => {
  it("closes a disabled execution without calling Brave or any fallback", async () => {
    const provider = providerWithResults(1);
    const setup = dependencies({ provider });
    const response = await runPrivateWebSearchWithDependencies(
      { userId: USER_ID, query: "desarrollo de software" },
      config({ enabled: false }),
      setup.deps,
    );
    expect(response).toMatchObject({
      executionId: EXECUTION_ID,
      status: "FAILED",
      errorCode: "PRIVATE_WEB_DISABLED",
    });
    expect(provider.search).not.toHaveBeenCalled();
    expect(setup.finishExecution).toHaveBeenCalledWith(
      expect.objectContaining({ status: "FAILED", errorMessage: "PRIVATE_WEB_DISABLED" }),
    );
  });

  it("uses the deterministic extractor and avoids Gemini when every gate passes", async () => {
    const setup = dependencies();
    const response = await runPrivateWebSearchWithDependencies(
      { userId: USER_ID, query: "desarrollo de software" },
      config(),
      setup.deps,
    );
    expect(response.status).toBe("COMPLETED");
    expect(response.candidatesPersisted).toBe(1);
    expect(response.resultDisposition).toBe("RESULTS_FOUND");
    expect(setup.deps.geminiExtractor).not.toHaveBeenCalled();
    expect(setup.finishExecution).toHaveBeenCalledWith(
      expect.objectContaining({ status: "COMPLETED" }),
    );
    const finish = setup.finishExecution.mock.calls[0]?.[0];
    expect(finish?.metrics).toMatchObject({
      plannerVersion: "private-web-brave-v2",
      searchProvider: "BRAVE",
      discoveryMode: "BRAVE_ONLY",
      baseRequests: expect.any(Number),
      paginationRequests: expect.any(Number),
      retries: expect.any(Number),
      yieldByFamily: expect.any(Object),
      qualifiedYieldByFamily: expect.any(Object),
      documentsFetchSucceeded: 1,
      documentsHtml: 1,
      documentsPdf: 0,
      geminiCalls: 0,
      candidatesVerified: 1,
      durationMs: expect.any(Number),
      limitsReached: expect.any(Array),
      outcome: "COMPLETED",
      resultDisposition: "RESULTS_FOUND",
      selectionMode: "QUALIFIED",
      qualifiedDocuments: 1,
      fallbackDocuments: 0,
      selectedDocumentTraces: [
        {
          title: "Solicitud de propuestas de software",
          domain: "buyer0.org.sv",
          family: expect.any(String),
          ranking: 1,
          ageBucket: "UNKNOWN",
          freshnessFactor: 0.7,
          documentType: "HTML",
          fetchOutcome: "FETCHED",
          extractionOutcome: "VERIFIED",
          candidateCount: 1,
          primaryRejectReason: null,
          secondaryRejectReasons: [],
        },
      ],
    });
    expect(JSON.stringify(finish?.metrics)).not.toContain("test-key");
    expect(JSON.stringify(finish?.metrics)).not.toContain(validText);
  });

  it("hard-caps document fetches at ten", async () => {
    const fetchDocument = vi.fn(async (url: string) => ({
      ok: true as const,
      document: fetchedDocument(url),
      robotsFromCache: false,
    }));
    const setup = dependencies({
      provider: providerWithResults(20),
      fetchDocument,
    });
    const response = await runPrivateWebSearchWithDependencies(
      { userId: USER_ID, query: "desarrollo de software" },
      config({ maxDocumentFetches: 100, maxPerDomain: 100 }),
      setup.deps,
    );
    expect(fetchDocument).toHaveBeenCalledTimes(10);
    expect(response.status).toBe("COMPLETED");
    expect(setup.finishExecution.mock.calls[0]?.[0].metrics).toMatchObject({
      plannedDocuments: 10,
      selectedDocuments: 10,
      attemptedDocuments: 10,
      successfulFetches: 10,
      partialReasons: [],
      technicalFailures: {},
    });
  });

  it("counts a completed fetch separately from a document rejected by the postfilter", async () => {
    const setup = dependencies({
      fetchDocument: vi.fn(async (url) => ({
        ok: true as const,
        robotsFromCache: false,
        document: {
          ...fetchedDocument(url),
          text: "Conoce nuestros servicios y contáctanos para cotizar.",
        },
      })),
    });

    const response = await runPrivateWebSearchWithDependencies(
      { userId: USER_ID, query: "desarrollo de software" },
      config(),
      setup.deps,
    );

    expect(response).toMatchObject({
      status: "COMPLETED",
      candidatesPersisted: 0,
    });
    expect(setup.finishExecution.mock.calls[0]?.[0].metrics).toMatchObject({
      selectedDocuments: 1,
      attemptedDocuments: 1,
      successfulFetches: 1,
      documentsFetchSucceeded: 0,
      partialReasons: [],
    });
  });

  it("completes an empty search when every extraction succeeds technically", async () => {
    const setup = dependencies({
      deterministicExtractor: vi.fn(() => null),
    });
    const response = await runPrivateWebSearchWithDependencies(
      { userId: USER_ID, query: "desarrollo de software" },
      config(),
      setup.deps,
    );

    expect(response).toMatchObject({
      status: "COMPLETED",
      candidatesFound: 0,
      candidatesPersisted: 0,
      resultDisposition: "NO_VERIFIED_RESULTS",
    });
    expect(setup.finishExecution.mock.calls[0]?.[0]).toMatchObject({
      status: "COMPLETED",
      errorMessage: null,
      metrics: {
        extractionAttempts: 1,
        extractionSuccesses: 1,
        extractionFailures: 0,
        geminiFailures: [],
        technicalFailures: {},
        partialReasons: [],
        outcome: "COMPLETED",
        resultDisposition: "NO_VERIFIED_RESULTS",
      },
    });
  });

  it("separates no discovery from no verified results", async () => {
    const setup = dependencies({ provider: providerWithResults(0) });
    const response = await runPrivateWebSearchWithDependencies(
      { userId: USER_ID, query: "desarrollo de software" },
      config(),
      setup.deps,
    );
    expect(response).toMatchObject({
      status: "COMPLETED",
      resultDisposition: "NO_DISCOVERY_RESULTS",
    });
    expect(setup.finishExecution.mock.calls[0]?.[0].metrics).toMatchObject({
      outcome: "COMPLETED",
      resultDisposition: "NO_DISCOVERY_RESULTS",
      selectedDocumentTraces: [],
    });
  });

  it("stores only sanitized per-candidate Gemini validation issues", async () => {
    const setup = dependencies({
      deterministicExtractor: vi.fn(() => null),
      geminiExtractor: vi.fn(async () => ({
        candidates: [],
        inputTokens: 4,
        outputTokens: 2,
        durationMs: 1,
        model: "test",
        promptVersion: "test",
        failureKind: null,
        invalidCandidates: [
          { issueCode: "invalid_value", path: "category", issueCount: 1 },
        ],
      })),
    });
    await runPrivateWebSearchWithDependencies(
      { userId: USER_ID, query: "desarrollo de software" },
      config(),
      setup.deps,
    );
    const metrics = setup.finishExecution.mock.calls[0]?.[0].metrics;
    expect(metrics).toMatchObject({
      extractionSuccesses: 1,
      geminiInvalidCandidates: [
        { issueCode: "invalid_value", path: "category", issueCount: 1 },
      ],
      discardCounts: { GEMINI_INVALID_CANDIDATE: 1 },
    });
    expect(JSON.stringify(metrics)).not.toMatch(/prompt|contents|remote-secret/i);
  });

  it("aggregates primary and secondary verification reasons separately", async () => {
    const setup = dependencies({
      deterministicExtractor: vi.fn((input) => {
        const candidate = extractPrivateOpportunityDeterministically(input);
        return candidate
          ? {
              ...candidate,
              evidence: candidate.evidence.filter((item) =>
                ["TITLE", "COUNTRY", "TEMPORAL"].includes(item.field),
              ),
            }
          : null;
      }),
      vertexConfigured: () => false,
    });
    const response = await runPrivateWebSearchWithDependencies(
      { userId: USER_ID, query: "mobiliario de oficina" },
      config(),
      setup.deps,
    );
    expect(response.resultDisposition).toBe("ALL_FILTERED");
    expect(setup.finishExecution.mock.calls[0]?.[0].metrics).toMatchObject({
      resultDisposition: "ALL_FILTERED",
      selectionMode: "FALLBACK_LOW_CONFIDENCE",
      qualifiedDocuments: 0,
      fallbackDocuments: 1,
      candidateRejectReason: { MISSING_BUYER: 1 },
      candidateSecondaryRejectReason: {
        MISSING_SCOPE: 1,
        MISSING_EXTERNAL_INTENT: 1,
        PUBLIC_OR_UNKNOWN_SECTOR: 1,
        QUERY_MISMATCH: 1,
      },
    });
  });

  it("keeps an old fallback document eligible when its verified deadline is future", async () => {
    const provider: WebSearchProvider = {
      name: "BRAVE",
      isConfigured: () => true,
      search: vi.fn(async (request, context) => ({
        results: [
          {
            ...result(
              "https://fundacion.org.sv/convocatorias/2021/rfp-software",
              request.query,
              context?.queryFamily ?? "unknown",
              1,
            ),
            publishedAt: "2021-01-15T12:00:00.000Z",
          },
        ],
        provider: "BRAVE" as const,
        requestCount: 1,
        retryCount: 0,
        durationMs: 1,
        exhausted: true,
        moreResultsAvailable: false,
        queryAltered: null,
      })),
    };
    const setup = dependencies({ provider });

    const response = await runPrivateWebSearchWithDependencies(
      { userId: USER_ID, query: "desarrollo de software" },
      config(),
      setup.deps,
    );

    expect(response).toMatchObject({
      status: "COMPLETED",
      candidatesPersisted: 1,
      resultDisposition: "RESULTS_FOUND",
    });
    expect(setup.finishExecution.mock.calls[0]?.[0].metrics).toMatchObject({
      selectionMode: "FALLBACK_LOW_CONFIDENCE",
      qualifiedDocuments: 0,
      fallbackDocuments: 1,
      selectedDocumentTraces: [
        expect.objectContaining({
          ageBucket: "OVER_2_YEARS",
          freshnessFactor: 0,
          extractionOutcome: "VERIFIED",
        }),
      ],
    });
  });

  it("partially completes with two successful extractions, PDF failures, and zero results", async () => {
    const setup = dependencies({
      provider: providerWithResults(3),
      fetchDocument: vi.fn(async (url: string) =>
        url.endsWith("-2")
          ? {
              ok: false as const,
              code: "PDF_PARSE_FAILED" as const,
              detail: "No fue posible procesar el PDF",
            }
          : {
              ok: true as const,
              document: fetchedDocument(url),
              robotsFromCache: false,
            },
      ),
      deterministicExtractor: vi.fn(() => null),
    });
    const response = await runPrivateWebSearchWithDependencies(
      { userId: USER_ID, query: "desarrollo de software" },
      config(),
      setup.deps,
    );

    expect(response).toMatchObject({
      status: "PARTIALLY_COMPLETED",
      candidatesPersisted: 0,
    });
    expect(setup.finishExecution.mock.calls[0]?.[0]).toMatchObject({
      status: "PARTIALLY_COMPLETED",
      errorMessage: null,
      metrics: {
        fetchAttempted: 3,
        fetchSucceeded: 2,
        fetchFailed: 1,
        pdfParseFailed: 1,
        pdfNoText: 0,
        extractionAttempted: 2,
        extractionSucceeded: 2,
        candidateExtracted: 0,
        candidateRejected: 0,
        candidateRejectReason: {},
        technicalFailures: { PDF_PARSE_FAILED: 1 },
      },
    });
  });

  it("fails with a sanitized Gemini code when every required extraction fails", async () => {
    const remoteError = Object.assign(
      new Error("project-secret prompt-secret document-secret"),
      { status: 400 },
    );
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const setup = dependencies({
      deterministicExtractor: vi.fn(() => null),
      geminiExtractor: vi.fn(async () => {
        throw remoteError;
      }),
    });

    const response = await runPrivateWebSearchWithDependencies(
      { userId: USER_ID, query: "desarrollo de software" },
      config(),
      setup.deps,
    );
    const finish = setup.finishExecution.mock.calls[0]?.[0];

    expect(response).toMatchObject({ status: "FAILED", candidatesPersisted: 0 });
    expect(finish).toMatchObject({
      status: "FAILED",
      errorMessage: "PIPELINE_INCOMPLETE",
      metrics: {
        extractionAttempts: 1,
        extractionSuccesses: 0,
        extractionFailures: 1,
        geminiFailures: [{ code: "INVALID_ARGUMENT", count: 1 }],
        technicalFailures: { GEMINI_EXTRACTION_FAILED: 1 },
        partialReasons: ["GEMINI_EXTRACTION_FAILED"],
      },
    });
    expect(errorLog).toHaveBeenCalledWith(
      "private_web_gemini_extraction_failed",
      {
        executionId: EXECUTION_ID,
        documentIndex: 0,
        code: "INVALID_ARGUMENT",
      },
    );
    expect(JSON.stringify(finish?.metrics)).not.toMatch(
      /project-secret|prompt-secret|document-secret/,
    );
    expect(JSON.stringify(errorLog.mock.calls)).not.toMatch(
      /project-secret|prompt-secret|document-secret/,
    );
    errorLog.mockRestore();
  });

  it("treats an invalid Gemini response as a sanitized technical failure", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const setup = dependencies({
      deterministicExtractor: vi.fn(() => null),
      geminiExtractor: vi.fn(async () => ({
        candidates: [],
        inputTokens: 8,
        outputTokens: 2,
        durationMs: 1,
        model: "test",
        promptVersion: "test",
        failureKind: "INVALID_RESPONSE" as const,
        invalidCandidates: [],
      })),
    });

    const response = await runPrivateWebSearchWithDependencies(
      { userId: USER_ID, query: "desarrollo de software" },
      config(),
      setup.deps,
    );

    expect(response).toMatchObject({ status: "FAILED", candidatesPersisted: 0 });
    expect(setup.finishExecution.mock.calls[0]?.[0].metrics).toMatchObject({
      extractionAttempts: 1,
      extractionSuccesses: 0,
      extractionFailures: 1,
      geminiFailures: [{ code: "INVALID_RESPONSE", count: 1 }],
      technicalFailures: { GEMINI_EXTRACTION_FAILED: 1 },
    });
    expect(warning).toHaveBeenCalledWith("private_web_gemini_invalid_response", {
      executionId: EXECUTION_ID,
      documentIndex: 0,
      code: "INVALID_RESPONSE",
    });
    warning.mockRestore();
  });

  it("partially completes when one extraction fails and another result persists", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const setup = dependencies({
      provider: providerWithResults(2),
      deterministicExtractor: vi.fn((input) =>
        input.document.finalUrl.endsWith("-0")
          ? extractPrivateOpportunityDeterministically(input)
          : null,
      ),
      geminiExtractor: vi.fn(async () => {
        throw Object.assign(new Error("quota detail"), { status: 429 });
      }),
    });

    const response = await runPrivateWebSearchWithDependencies(
      { userId: USER_ID, query: "desarrollo de software" },
      config(),
      setup.deps,
    );

    expect(response).toMatchObject({
      status: "PARTIALLY_COMPLETED",
      candidatesPersisted: 1,
    });
    expect(setup.finishExecution.mock.calls[0]?.[0].metrics).toMatchObject({
      extractionAttempts: 1,
      extractionSuccesses: 0,
      extractionFailures: 1,
      geminiFailures: [{ code: "RESOURCE_EXHAUSTED", count: 1 }],
      technicalFailures: { GEMINI_EXTRACTION_FAILED: 1 },
    });
    errorLog.mockRestore();
  });

  it("distinguishes a normal textless PDF from a technical PDF parser failure", async () => {
    const noText = dependencies({
      fetchDocument: vi.fn(async () => ({
        ok: false as const,
        code: "PDF_NO_EXTRACTABLE_TEXT" as const,
        detail: "El PDF no contiene texto extraíble",
      })),
    });
    const noTextResponse = await runPrivateWebSearchWithDependencies(
      { userId: USER_ID, query: "desarrollo de software" },
      config(),
      noText.deps,
    );

    const parserFailure = dependencies({
      fetchDocument: vi.fn(async () => ({
        ok: false as const,
        code: "PDF_PARSE_FAILED" as const,
        detail: "No fue posible procesar el PDF",
      })),
    });
    const parserFailureResponse = await runPrivateWebSearchWithDependencies(
      { userId: USER_ID, query: "desarrollo de software" },
      config(),
      parserFailure.deps,
    );
    const invalidSignature = dependencies({
      fetchDocument: vi.fn(async () => ({
        ok: false as const,
        code: "PDF_INVALID_SIGNATURE" as const,
        detail: "La firma del PDF no es válida",
      })),
    });
    const invalidSignatureResponse = await runPrivateWebSearchWithDependencies(
      { userId: USER_ID, query: "desarrollo de software" },
      config(),
      invalidSignature.deps,
    );

    expect(noTextResponse).toMatchObject({
      status: "COMPLETED",
      candidatesPersisted: 0,
    });
    expect(noText.finishExecution.mock.calls[0]?.[0].metrics).toMatchObject({
      technicalFailures: {},
      partialReasons: [],
    });
    expect(parserFailureResponse).toMatchObject({
      status: "FAILED",
      candidatesPersisted: 0,
    });
    expect(parserFailure.finishExecution.mock.calls[0]?.[0].metrics).toMatchObject({
      technicalFailures: { PDF_PARSE_FAILED: 1 },
      partialReasons: ["PDF_PARSE_FAILED"],
    });
    expect(invalidSignatureResponse).toMatchObject({
      status: "FAILED",
      candidatesPersisted: 0,
    });
    expect(invalidSignature.finishExecution.mock.calls[0]?.[0].metrics).toMatchObject({
      technicalFailures: { PDF_INVALID_SIGNATURE: 1 },
      partialReasons: ["PDF_INVALID_SIGNATURE"],
    });
  });

  it("hard-caps Gemini extraction calls at six", async () => {
    const geminiExtractor = vi.fn(async () => ({
      candidates: [],
      inputTokens: 0,
      outputTokens: 0,
      durationMs: 1,
      model: "test",
      promptVersion: "test",
      failureKind: null,
    }));
    const setup = dependencies({
      provider: providerWithResults(20),
      deterministicExtractor: vi.fn(() => null),
      geminiExtractor,
    });
    await runPrivateWebSearchWithDependencies(
      { userId: USER_ID, query: "desarrollo de software" },
      config({ maxGeminiExtractions: 100 }),
      setup.deps,
    );
    expect(geminiExtractor).toHaveBeenCalledTimes(6);
  });

  it("closes the execution when the total timeout interrupts Gemini", async () => {
    const setup = dependencies({
      deterministicExtractor: vi.fn(() => null),
      geminiExtractor: vi.fn(
        async () => await new Promise<never>(() => undefined),
      ),
    });
    const response = await runPrivateWebSearchWithDependencies(
      { userId: USER_ID, query: "desarrollo de software" },
      config({ totalTimeoutMs: 5 }),
      setup.deps,
    );
    expect(response.status).toBe("FAILED");
    expect(setup.finishExecution).toHaveBeenCalledWith(
      expect.objectContaining({ status: "FAILED" }),
    );
    expect(setup.finishExecution.mock.calls.at(-1)?.[0].metrics).toMatchObject({
      terminationCause: "TOTAL_TIMEOUT",
    });
  });

  it("fails cleanly and closes the execution when every Brave request fails", async () => {
    const provider: WebSearchProvider = {
      name: "BRAVE",
      isConfigured: () => true,
      search: vi.fn(async () => {
        throw new WebSearchProviderError(
          "PROVIDER_REQUEST_FAILED",
          "network internal detail",
          { attempts: 1 },
        );
      }),
    };
    const setup = dependencies({ provider });
    const response = await runPrivateWebSearchWithDependencies(
      { userId: USER_ID, query: "desarrollo de software" },
      config(),
      setup.deps,
    );
    expect(response).toMatchObject({ status: "FAILED", errorCode: "BRAVE_FAILED" });
    expect(JSON.stringify(response)).not.toContain("internal detail");
    expect(setup.finishExecution).toHaveBeenCalledWith(
      expect.objectContaining({ status: "FAILED", errorMessage: "BRAVE_FAILED" }),
    );
  });

  it("rejects active and hourly limits before calling Brave", async () => {
    for (const admission of [
      { kind: "ACTIVE_LIMIT" as const, retryAfterSeconds: 60 },
      { kind: "RATE_LIMIT" as const, retryAfterSeconds: 600 },
    ]) {
      const provider = providerWithResults(1);
      const setup = dependencies({ provider });
      setup.deps.repository.startExecution = vi.fn(async () => admission);
      await expect(
        runPrivateWebSearchWithDependencies(
          { userId: USER_ID, query: "desarrollo de software" },
          config(),
          setup.deps,
        ),
      ).rejects.toBeInstanceOf(PrivateWebSearchAdmissionError);
      expect(provider.search).not.toHaveBeenCalled();
      expect(setup.finishExecution).not.toHaveBeenCalled();
    }
  });

  it("retries an initially failing execution close from finally", async () => {
    let attempts = 0;
    const finishExecution = vi.fn(async () => {
      attempts += 1;
      if (attempts < 4) throw new Error("transient database error");
    });
    const setup = dependencies();
    setup.deps.repository.finishExecution = finishExecution;
    const response = await runPrivateWebSearchWithDependencies(
      { userId: USER_ID, query: "desarrollo de software" },
      config({ enabled: false }),
      setup.deps,
    );
    expect(response.status).toBe("FAILED");
    expect(finishExecution).toHaveBeenCalledTimes(4);
  });

  it("uses a PostgreSQL advisory lock for atomic per-user admission", () => {
    const source = readFileSync(new URL("./persistence.ts", import.meta.url), "utf8");
    expect(source).toContain("pg_advisory_xact_lock");
    expect(source).toMatch(/ACTIVE_LIMIT[\s\S]*RATE_LIMIT[\s\S]*insert\(searchExecutions\)/);
  });

  it("enforces hard pipeline limits and preserves LINKEDIN provenance", () => {
    expect(PRIVATE_WEB_HARD_LIMITS).toMatchObject({
      braveRequests: 8,
      providerResults: 160,
      uniqueUrls: 60,
      documentFetches: 10,
      geminiExtractions: 6,
      results: 50,
      perDomain: 3,
    });
    expect(canUseExistingPrivateWebCanonical("PRIVATE_WEB")).toBe(true);
    expect(canUseExistingPrivateWebCanonical("LINKEDIN")).toBe(false);
  });

  it("associates one canonical URL with two user executions and keeps dismissals private", async () => {
    const canonical = new Map<string, string>();
    const associations = new Set<string>();
    const dismissed = new Set<string>();
    let executionSequence = 0;
    const repository: PrivateWebServiceDependencies["repository"] = {
      startExecution: vi.fn(async (input) => {
        executionSequence += 1;
        return {
          kind: "STARTED" as const,
          profileId: `profile-${input.userId}`,
          executionId: `00000000-0000-4000-8000-${String(executionSequence).padStart(12, "0")}`,
        };
      }),
      persistCandidate: vi.fn(async (input) => {
        const existing = canonical.get(input.candidate.normalizedUrl);
        const id = existing ?? crypto.randomUUID();
        canonical.set(input.candidate.normalizedUrl, id);
        if (dismissed.has(`${input.userId}:${id}`)) return { kind: "DISMISSED" as const };
        associations.add(`${input.executionId}:${id}`);
        return {
          kind: "PERSISTED" as const,
          id,
          outcome: existing ? ("UNCHANGED" as const) : ("CREATED" as const),
        };
      }),
      finishExecution: vi.fn(async () => undefined),
    };
    const first = dependencies({ repository });
    const userOne = await runPrivateWebSearchWithDependencies(
      { userId: "user-one", query: "desarrollo de software" },
      config(),
      first.deps,
    );
    const userTwo = await runPrivateWebSearchWithDependencies(
      { userId: "user-two", query: "desarrollo de software" },
      config(),
      first.deps,
    );
    expect(userOne.candidatesPersisted).toBe(1);
    expect(userTwo.candidatesPersisted).toBe(1);
    expect(canonical.size).toBe(1);
    expect(associations.size).toBe(2);

    const [[, canonicalId]] = [...canonical.entries()];
    dismissed.add(`user-one:${canonicalId}`);
    const dismissedRun = await runPrivateWebSearchWithDependencies(
      { userId: "user-one", query: "desarrollo de software" },
      config(),
      first.deps,
    );
    expect(dismissedRun.candidatesPersisted).toBe(0);
    expect(dismissedRun).toMatchObject({
      status: "COMPLETED",
      resultDisposition: "ALL_FILTERED",
    });
    expect(associations.size).toBe(2);
  });

  it("contains no Grounding, URL Context or search fallback dependency", () => {
    const source = readFileSync(new URL("./service.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/searchWithGrounding|getVertexGroundingClient|googleSearch|urlContext/i);
  });

  it("contains no legacy misspelled result disposition", () => {
    const invalidDisposition = ["RES", "ULLL", "_FILTERED"].join("");
    const matches = typeScriptSources(new URL("../../../", import.meta.url)).filter(
      (source) => readFileSync(source, "utf8").includes(invalidDisposition),
    );
    expect(matches).toEqual([]);
  });
});
