import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({ db: {} }));

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
    snippet: "Solicitud de propuestas para contratar proveedor de desarrollo de software",
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
    expect(setup.deps.geminiExtractor).not.toHaveBeenCalled();
    expect(setup.finishExecution).toHaveBeenCalledWith(
      expect.objectContaining({ status: "COMPLETED" }),
    );
    const finish = setup.finishExecution.mock.calls[0]?.[0];
    expect(finish?.metrics).toMatchObject({
      plannerVersion: "private-web-brave-v1",
      searchProvider: "BRAVE",
      discoveryMode: "BRAVE_ONLY",
      baseRequests: expect.any(Number),
      paginationRequests: expect.any(Number),
      retries: expect.any(Number),
      yieldByFamily: expect.any(Object),
      documentsFetchSucceeded: 1,
      documentsHtml: 1,
      documentsPdf: 0,
      geminiCalls: 0,
      candidatesVerified: 1,
      durationMs: expect.any(Number),
      limitsReached: expect.any(Array),
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
    expect(response.status).toBe("PARTIALLY_COMPLETED");
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
    expect(associations.size).toBe(2);
  });

  it("contains no Grounding, URL Context or search fallback dependency", () => {
    const source = readFileSync(new URL("./service.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/searchWithGrounding|getVertexGroundingClient|googleSearch|urlContext/i);
  });
});
