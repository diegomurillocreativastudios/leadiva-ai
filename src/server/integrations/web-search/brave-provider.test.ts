import { beforeEach, describe, expect, it, vi } from "vitest";

import { BraveSearchProvider } from "./brave-provider";
import {
  WebSearchProviderError,
  type WebSearchErrorCode,
} from "./contracts";

const request = {
  query: "website redesign RFP",
  language: "en" as const,
  page: 1,
  resultsPerPage: 10,
  timeoutMs: 1_000,
};

function provider(fetchImpl: typeof fetch, overrides: Record<string, unknown> = {}) {
  return new BraveSearchProvider({
    apiKey: "secret-test-key",
    maxRetries: 2,
    timeoutMs: 1_000,
    fetchImpl,
    sleepImpl: vi.fn(async () => undefined),
    randomImpl: () => 0,
    ...overrides,
  });
}

async function expectCode(promise: Promise<unknown>, code: WebSearchErrorCode) {
  await expect(promise).rejects.toMatchObject({ code } satisfies Partial<WebSearchProviderError>);
}

describe("BraveSearchProvider", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("maps a valid web response and preserves query provenance", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        query: { more_results_available: true },
        web: {
          results: [
            {
              title: "<strong>Website</strong> RFP",
              url: "https://buyer.example/rfp",
              description: "Submit &amp; proposal",
              page_age: "2026-07-10",
            },
          ],
        },
      }),
    ) as typeof fetch;

    const result = await provider(fetchImpl).search(request, {
      queryFamily: "explicit_procurement",
    });

    expect(result.results[0]).toMatchObject({
      title: "Website RFP",
      domain: "buyer.example",
      snippet: "Submit & proposal",
      queryFamily: "explicit_procurement",
      rank: 1,
      provider: "BRAVE",
    });
    expect(result.requestCount).toBe(1);
  });

  it("supports empty responses and missing snippets", async () => {
    const empty = provider(
      vi.fn(async () => Response.json({ web: { results: [] } })) as typeof fetch,
    );
    expect((await empty.search(request)).results).toEqual([]);

    const missingSnippet = provider(
      vi.fn(async () =>
        Response.json({
          web: { results: [{ title: "RFP", url: "https://a.example/rfp" }] },
        }),
      ) as typeof fetch,
    );
    expect((await missingSnippet.search(request)).results[0]?.snippet).toBeNull();
  });

  it("skips invalid URLs without invalidating other results", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        web: {
          results: [
            { title: "Bad", url: "javascript:alert(1)" },
            { title: "Good", url: "https://good.example/rfp" },
          ],
        },
      }),
    ) as typeof fetch;
    expect((await provider(fetchImpl).search(request)).results).toHaveLength(1);
  });

  it("fails explicitly when the key is missing", async () => {
    const instance = new BraveSearchProvider({
      apiKey: "",
      maxRetries: 0,
      timeoutMs: 100,
    });
    await expectCode(instance.search(request), "PROVIDER_NOT_CONFIGURED");
  });

  it.each([401, 403])("does not retry permanent auth error %s", async (status) => {
    const fetchImpl = vi.fn(async () => new Response(null, { status })) as typeof fetch;
    await expectCode(provider(fetchImpl).search(request), "PROVIDER_UNAUTHORIZED");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries 429 and honors Retry-After", async () => {
    const sleepImpl = vi.fn(async () => undefined);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 429, headers: { "Retry-After": "2" } }),
      )
      .mockResolvedValueOnce(Response.json({ web: { results: [] } })) as typeof fetch;

    const result = await provider(fetchImpl, { sleepImpl }).search(request);
    expect(result.retryCount).toBe(1);
    expect(sleepImpl).toHaveBeenCalledWith(2_000);
  });

  it("uses exponential backoff for 429 without reset headers", async () => {
    const sleepImpl = vi.fn(async () => undefined);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(Response.json({ web: { results: [] } })) as typeof fetch;
    await provider(fetchImpl, { sleepImpl }).search(request);
    expect(sleepImpl).toHaveBeenCalledWith(250);
  });

  it("retries 5xx and fails after the configured attempts", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 })) as typeof fetch;
    await expectCode(
      provider(fetchImpl, { maxRetries: 1 }).search(request),
      "PROVIDER_REQUEST_FAILED",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("distinguishes timeout from caller cancellation", async () => {
    const hanging = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    ) as typeof fetch;
    await expectCode(
      provider(hanging).search({ ...request, timeoutMs: 5 }),
      "PROVIDER_TIMEOUT",
    );

    const controller = new AbortController();
    const cancelled = provider(hanging).search(request, { signal: controller.signal });
    controller.abort();
    await expectCode(cancelled, "PROVIDER_REQUEST_FAILED");
  });

  it("rejects non-JSON responses", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("not-json", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    ) as typeof fetch;
    await expectCode(provider(fetchImpl).search(request), "PROVIDER_BAD_RESPONSE");
  });

  it("never writes the API key to retry logs", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(Response.json({ web: { results: [] } })) as typeof fetch;
    await provider(fetchImpl).search(request);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret-test-key");
  });
});
