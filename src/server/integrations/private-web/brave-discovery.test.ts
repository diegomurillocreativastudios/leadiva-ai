import { describe, expect, it, vi } from "vitest";

import type {
  WebSearchProvider,
  WebSearchRequest,
} from "@/server/integrations/web-search/contracts";

import { discoverPrivateWebWithBrave } from "./brave-discovery";

function provider(
  handler: (
    request: WebSearchRequest,
    family: string,
  ) => { count: number; more?: boolean; requestCount?: number },
): WebSearchProvider {
  return {
    name: "BRAVE",
    isConfigured: () => true,
    search: vi.fn(async (request, context) => {
      const family = context?.queryFamily ?? "unknown";
      const response = handler(request, family);
      return {
        results: Array.from({ length: response.count }, (_, index) => ({
          title: `Solicitud de propuestas ${family} ${index}`,
          url: `https://${family}-${index}.org.sv/convocatorias/rfp-${request.page}-${index}`,
          snippet:
            "Solicitud de propuestas para contratar proveedor de desarrollo de software",
          domain: `${family}-${index}.org.sv`,
          publishedAt: null,
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
  query: "desarrollo de software",
  maxRequests: 8,
  maxProviderResults: 160,
  maxUniqueUrls: 60,
  timeoutMs: 35_000,
  requestTimeoutMs: 1_000,
};

describe("adaptive Brave discovery", () => {
  it("runs stage two after zero initial results", async () => {
    const searchProvider = provider(() => ({ count: 0 }));
    const result = await discoverPrivateWebWithBrave({
      ...input,
      provider: searchProvider,
    });
    expect(result.metrics.familiesExecuted).toHaveLength(6);
    expect(result.metrics.familiesExecuted).toEqual(
      expect.arrayContaining(["org_sv_convocation", "com_sv_provider"]),
    );
  });

  it("avoids stage two after good yield", async () => {
    const searchProvider = provider(() => ({ count: 12 }));
    const result = await discoverPrivateWebWithBrave({
      ...input,
      provider: searchProvider,
    });
    expect(result.metrics.familiesExecuted).toHaveLength(4);
    expect(result.metrics.familiesExecuted).not.toContain("org_sv_convocation");
  });

  it("paginates only the two best families with more_results_available", async () => {
    const searchProvider = provider((request, family) => ({
      count: family === "base_provider_sv" ? 12 : 9,
      more:
        request.page === 1 &&
        ["base_provider_sv", "proposal_sv", "terms_sv"].includes(family),
    }));
    const result = await discoverPrivateWebWithBrave({
      ...input,
      provider: searchProvider,
    });
    const pageTwoCalls = vi
      .mocked(searchProvider.search)
      .mock.calls.filter(([request]) => request.page === 2);
    expect(pageTwoCalls).toHaveLength(2);
    expect(result.metrics.paginationRequests).toBe(2);
  });

  it("counts retries inside the hard request budget", async () => {
    const searchProvider = provider(() => ({ count: 0, requestCount: 2 }));
    const result = await discoverPrivateWebWithBrave({
      ...input,
      provider: searchProvider,
    });
    expect(result.metrics.totalRequests).toBeLessThanOrEqual(8);
    expect(result.metrics.retries).toBe(4);
    expect(result.metrics.limitsReached).toContain("PRIVATE_WEB_MAX_BRAVE_REQUESTS");
  });
});

