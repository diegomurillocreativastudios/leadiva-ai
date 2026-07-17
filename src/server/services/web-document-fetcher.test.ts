import { describe, expect, it, vi } from "vitest";

import {
  extractHtmlDocument,
  extractPdfText,
  fetchWebDocument,
  HostConcurrencyLimiter,
} from "./web-document-fetcher";

function deps(fetchImpl: typeof fetch, overrides: Record<string, unknown> = {}) {
  return {
    fetchImpl,
    lookupImpl: async () => [{ address: "8.8.8.8", family: 4 }],
    now: () => new Date("2026-07-16T00:00:00Z"),
    timeoutMs: 1_000,
    maxRedirects: 4,
    maxDocumentBytes: 5_000,
    maxPdfPages: 3,
    userAgent: "CreativaLeadsBot/1.0",
    robotsCacheTtlMs: 60_000,
    robotsCache: new Map(),
    ...overrides,
  };
}

function robotsThen(response: Response): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) =>
    String(input).endsWith("/robots.txt")
      ? new Response("User-agent: *\nDisallow:", { status: 200 })
      : response,
  ) as typeof fetch;
}

describe("HTML extraction", () => {
  it("extracts canonical URL, relevant links and text without scripts/navigation", () => {
    const result = extractHtmlDocument(
      `<html><head><title>RFP &amp; Platform</title><link rel="canonical" href="/rfp/42"></head>
       <body><nav>Menu noise</nav><main><h1>Request for proposal</h1><p>Deadline July 30</p>
       <script>alert(1)</script><a href="/files/terms.pdf">Terms PDF</a></main></body></html>`,
      "https://buyer.example/notices/42",
    );
    expect(result.title).toBe("RFP & Platform");
    expect(result.canonicalUrl).toBe("https://buyer.example/rfp/42");
    expect(result.text).toContain("Deadline July 30");
    expect(result.text).not.toContain("alert");
    expect(result.links).toEqual(["https://buyer.example/files/terms.pdf"]);
  });
});

describe("PDF extraction", () => {
  it("validates the signature, limits pages and extracts text without OCR", async () => {
    const destroy = vi.fn(async () => undefined);
    const result = await extractPdfText(
      new TextEncoder().encode("%PDF-test"),
      2,
      async () => ({
        numPages: 5,
        getPage: async (page) => ({
          getTextContent: async () => ({ items: [{ str: `Page ${page} RFP` }] }),
        }),
        destroy,
      }),
    );
    expect(result.pagesProcessed).toBe(2);
    expect(result.text).toContain("Page 2 RFP");
    expect(destroy).toHaveBeenCalled();
  });
});

describe("safe document fetching", () => {
  it("blocks localhost and private DNS before document fetch", async () => {
    const fetchImpl = vi.fn();
    expect(await fetchWebDocument("http://127.0.0.1/a", deps(fetchImpl as typeof fetch))).toMatchObject({ ok: false, code: "BLOCKED_IP" });
    expect(
      await fetchWebDocument(
        "https://private.example/a",
        deps(fetchImpl as typeof fetch, {
          lookupImpl: async () => [{ address: "10.0.0.2", family: 4 }],
        }),
      ),
    ).toMatchObject({ ok: false, code: "BLOCKED_IP" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("blocks a safe redirect that resolves to a private IP", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/robots.txt")) {
        return new Response("User-agent: *\nDisallow:");
      }
      return new Response(null, {
        status: 302,
        headers: { location: "https://internal.example/secret" },
      });
    }) as typeof fetch;
    const lookupImpl = vi.fn(async (host: string) => [
      { address: host === "internal.example" ? "10.0.0.5" : "8.8.8.8", family: 4 },
    ]);
    expect(
      await fetchWebDocument(
        "https://public.example/rfp",
        deps(fetchImpl, { lookupImpl }),
      ),
    ).toMatchObject({ ok: false, code: "BLOCKED_IP" });
  });

  it("blocks simulated DNS rebinding between robots and document fetch", async () => {
    let lookups = 0;
    const lookupImpl = vi.fn(async () => {
      lookups += 1;
      return [{ address: lookups < 3 ? "8.8.8.8" : "10.0.0.5", family: 4 }];
    });
    const fetchImpl = robotsThen(new Response("<html>RFP</html>", { headers: { "content-type": "text/html" } }));
    expect(
      await fetchWebDocument(
        "https://rebind.example/rfp",
        deps(fetchImpl, { lookupImpl }),
      ),
    ).toMatchObject({ ok: false, code: "BLOCKED_IP" });
  });

  it("respects robots disallow", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("User-agent: CreativaLeadsBot\nDisallow: /private"),
    ) as typeof fetch;
    expect(
      await fetchWebDocument("https://buyer.example/private/rfp", deps(fetchImpl)),
    ).toMatchObject({ ok: false, code: "ROBOTS_DISALLOWED" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fetches bounded HTML and rejects large or unsupported content", async () => {
    const html = await fetchWebDocument(
      "https://buyer.example/rfp",
      deps(
        robotsThen(
          new Response("<html><title>RFP</title><main>Submit proposal</main></html>", {
            headers: { "content-type": "text/html" },
          }),
        ),
      ),
    );
    expect(html).toMatchObject({ ok: true, document: { title: "RFP" } });

    const large = await fetchWebDocument(
      "https://buyer.example/large",
      deps(
        robotsThen(new Response("x", { headers: { "content-type": "text/html", "content-length": "6000" } })),
      ),
    );
    expect(large).toMatchObject({ ok: false, code: "DOCUMENT_TOO_LARGE" });

    const image = await fetchWebDocument(
      "https://buyer.example/logo",
      deps(robotsThen(new Response("png", { headers: { "content-type": "image/png" } }))),
    );
    expect(image).toMatchObject({ ok: false, code: "UNSUPPORTED_CONTENT_TYPE" });
  });

  it("reports timeout", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/robots.txt")) {
        return new Response("", { status: 404 });
      }
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });
    }) as typeof fetch;
    expect(
      await fetchWebDocument(
        "https://buyer.example/rfp",
        deps(fetchImpl, { timeoutMs: 5 }),
      ),
    ).toMatchObject({ ok: false, code: "TIMEOUT" });
  });

  it("parses a bounded PDF and reports PDFs without text", async () => {
    const pdfResponse = () =>
      new Response(new TextEncoder().encode("%PDF-test"), {
        headers: { "content-type": "application/pdf" },
      });
    const valid = await fetchWebDocument(
      "https://buyer.example/terms.pdf",
      deps(robotsThen(pdfResponse()), {
        loadPdfDocument: async () => ({
          numPages: 1,
          getPage: async () => ({ getTextContent: async () => ({ items: [{ str: "Terms of reference" }] }) }),
          destroy: async () => undefined,
        }),
      }),
    );
    expect(valid).toMatchObject({ ok: true, document: { pdfPagesProcessed: 1 } });

    const noText = await fetchWebDocument(
      "https://buyer.example/scan.pdf",
      deps(robotsThen(pdfResponse()), {
        loadPdfDocument: async () => ({
          numPages: 1,
          getPage: async () => ({ getTextContent: async () => ({ items: [] }) }),
          destroy: async () => undefined,
        }),
      }),
    );
    expect(noText).toMatchObject({ ok: false, code: "PDF_NO_EXTRACTABLE_TEXT" });
  });

  it("enforces per-host concurrency", async () => {
    const limiter = new HostConcurrencyLimiter(1);
    let active = 0;
    let peak = 0;
    await Promise.all([
      limiter.run("https://same.example/a", async () => {
        active += 1;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active -= 1;
      }),
      limiter.run("https://same.example/b", async () => {
        active += 1;
        peak = Math.max(peak, active);
        active -= 1;
      }),
    ]);
    expect(peak).toBe(1);
  });
});
