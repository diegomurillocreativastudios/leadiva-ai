import { describe, expect, it, vi } from "vitest";

import type {
  WebSearchProvider,
  WebSearchRequest,
} from "@/server/integrations/web-search/contracts";

import { discoverPrivateWebWithBrave } from "./brave-discovery";

type ProviderResult = {
  count: number;
  qualified?: boolean;
  more?: boolean;
  requestCount?: number;
};

function provider(
  handler: (request: WebSearchRequest, family: string) => ProviderResult,
): WebSearchProvider {
  return {
    name: "BRAVE",
    isConfigured: () => true,
    search: vi.fn(async (request, context) => {
      const family = context?.queryFamily ?? "unknown";
      const familyCode = [
        "base_provider_sv",
        "proposal_system_sv",
        "services_development_sv",
        "quotation_web_sv",
        "terms_implementation_sv",
        "offers_software_sv",
      ].indexOf(family);
      const response = handler(request, family);
      const qualified = response.qualified !== false;
      return {
        results: Array.from({ length: response.count }, (_, index) => ({
          title: qualified
            ? `Solicitud de propuestas de software ${familyCode} ${index}`
            : `Solicitud de propuestas de auditoría ${familyCode} ${index}`,
          url: `https://buyer-${familyCode}-${index}.org.sv/convocatorias/rfp-${request.page}-${index}`,
          snippet: qualified
            ? "Solicitud de propuestas para contratar proveedor de desarrollo de software en El Salvador. Fecha límite: 31/12/2026."
            : "Solicitud de propuestas para auditoría financiera en El Salvador. Fecha límite: 31/12/2026.",
          domain: `buyer-${familyCode}-${index}.org.sv`,
          publishedAt: "2026-07-15T12:00:00.000Z",
          age: null,
          extraSnippets: [],
          query: request.query,
          queryFamily: family,
          rank: index + 1,
          provider: "BRAVE",
        })),
        provider: "BRAVE",
        requestCount: response.requestCount ?? 1,
        retryCount: (response.requestCount ?? 1) - 1,
        durationMs: 1,
        exhausted: response.more !== true,
        moreResultsAvailable: response.more === true,
        queryAltered: null,
      };
    }),
  };
}

const input = {
  executionId: "00000000-0000-4000-8000-000000000201",
  query: "Sistemas de Software",
  maxRequests: 8,
  maxProviderResults: 160,
  maxUniqueUrls: 60,
  timeoutMs: 35_000,
  requestTimeoutMs: 1_000,
  now: new Date("2026-07-21T12:00:00.000Z"),
};

describe("qualified adaptive Brave discovery", () => {
  it("runs the two adaptive families after zero qualified initial yield", async () => {
    const searchProvider = provider(() => ({ count: 10, qualified: false }));
    const result = await discoverPrivateWebWithBrave({
      ...input,
      provider: searchProvider,
    });
    expect(result.metrics.familiesExecuted).toHaveLength(6);
    expect(result.metrics.familiesExecuted).toEqual(
      expect.arrayContaining([
        "terms_implementation_sv",
        "offers_software_sv",
      ]),
    );
    expect(result.metrics.qualifiedYield).toBe(0);
  });

  it("avoids stage two after useful qualified yield", async () => {
    const searchProvider = provider(() => ({ count: 12 }));
    const result = await discoverPrivateWebWithBrave({
      ...input,
      provider: searchProvider,
    });
    expect(result.metrics.familiesExecuted).toHaveLength(4);
    expect(result.metrics.familiesExecuted).not.toContain(
      "terms_implementation_sv",
    );
    expect(result.metrics.qualifiedYield).toBeGreaterThanOrEqual(6);
  });

  it("uses qualified yield rather than a large raw eligible volume", async () => {
    const searchProvider = provider((_request, family) => ({
      count: 15,
      qualified: family === "terms_implementation_sv",
    }));
    const result = await discoverPrivateWebWithBrave({
      ...input,
      provider: searchProvider,
    });
    expect(result.metrics.yieldByFamily.base_provider_sv).toBe(15);
    expect(result.metrics.qualifiedYieldByFamily.base_provider_sv).toBe(0);
    expect(result.metrics.familiesExecuted).toContain("terms_implementation_sv");
  });

  it("paginates quality-producing families, not generic PDF volume", async () => {
    const searchProvider = provider((request, family) => ({
      count: family === "base_provider_sv" ? 15 : 3,
      qualified: family !== "base_provider_sv",
      more:
        request.page === 1 &&
        [
          "base_provider_sv",
          "proposal_system_sv",
          "services_development_sv",
        ].includes(family),
    }));
    const result = await discoverPrivateWebWithBrave({
      ...input,
      provider: searchProvider,
    });
    const pageTwoFamilies = vi
      .mocked(searchProvider.search)
      .mock.calls.filter(([request]) => request.page === 2)
      .map(([, context]) => context?.queryFamily);
    expect(pageTwoFamilies).toHaveLength(2);
    expect(pageTwoFamilies).not.toContain("base_provider_sv");
    expect(pageTwoFamilies).toEqual(
      expect.arrayContaining([
        "proposal_system_sv",
        "services_development_sv",
      ]),
    );
    expect(result.metrics.paginationRequests).toBe(2);
  });

  it("counts retries inside the unchanged eight-request budget", async () => {
    const searchProvider = provider(() => ({ count: 0, requestCount: 2 }));
    const result = await discoverPrivateWebWithBrave({
      ...input,
      provider: searchProvider,
    });
    expect(result.metrics.totalRequests).toBeLessThanOrEqual(8);
    expect(result.metrics.retries).toBe(4);
    expect(result.metrics.limitsReached).toContain(
      "PRIVATE_WEB_MAX_BRAVE_REQUESTS",
    );
  });
});
