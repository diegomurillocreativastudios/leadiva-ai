import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  classifyPdfParserFailure,
  extractHtmlDocument,
  extractPdfText,
  fetchWebDocument,
  HostConcurrencyLimiter,
  loadPdfDocumentWithPdfJs,
} from "./web-document-fetcher";

const textualPdfUrl = new URL("../../test/fixtures/text-document.pdf", import.meta.url);

async function textualPdf(): Promise<Buffer> {
  return readFile(textualPdfUrl);
}

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
    expect(result.title).toBe("Request for proposal");
    expect(result.canonicalUrl).toBe("https://buyer.example/rfp/42");
    expect(result.text).toContain("Deadline July 30");
    expect(result.text).not.toContain("alert");
    expect(result.links).toEqual(["https://buyer.example/files/terms.pdf"]);
  });

  it("uses the HTML title when the first heading is generic", () => {
    const result = extractHtmlDocument(
      "<html><head><title>Convocatoria para plataforma digital</title></head><body><main><h1>Inicio</h1></main></body></html>",
      "https://buyer.example/convocatoria",
    );

    expect(result).toMatchObject({
      title: "Convocatoria para plataforma digital",
      titleSource: "HTML_TITLE",
    });
  });
});

describe("PDF extraction", () => {
  it("opens the repository PDF with real pdfjs and extracts text", async () => {
    const fixture = await textualPdf();
    let parserInput: Uint8Array | null = null;
    const result = await extractPdfText(fixture, 10, async (bytes) => {
      parserInput = bytes;
      return loadPdfDocumentWithPdfJs(bytes);
    });

    expect(result.pagesProcessed).toBeGreaterThanOrEqual(1);
    expect(result.text).toContain("Leadiva PDF parser fixture");
    expect(parserInput).toBeInstanceOf(Uint8Array);
    expect(Buffer.isBuffer(parserInput)).toBe(false);
    const validatedInput = parserInput as unknown as Uint8Array;
    expect(validatedInput.byteOffset).toBe(0);
    expect(validatedInput.byteLength).toBe(validatedInput.buffer.byteLength);
  });

  it("accepts both Buffer and Uint8Array through the real pdfjs adapter", async () => {
    const fixture = await textualPdf();
    const fromBuffer = await extractPdfText(fixture, 10);
    const fromUint8Array = await extractPdfText(Uint8Array.from(fixture), 10);

    expect(fromBuffer).toEqual(fromUint8Array);
    expect(fromBuffer.text).toContain("Leadiva PDF parser fixture");
  });

  it("extracts no text from a real textless PDF", async () => {
    const fixture = await textualPdf();
    const textless = Buffer.from(
      fixture
        .toString("latin1")
        .replace("Leadiva PDF parser fixture", " ".repeat(26)),
      "latin1",
    );
    const parsed = await extractPdfText(textless, 10);

    expect(parsed.pagesProcessed).toBe(1);
    expect(parsed.text).toBe("");
  });

  it("classifies password and unsupported parser exceptions without messages", () => {
    expect(
      classifyPdfParserFailure(
        Object.assign(new Error("remote protected detail"), {
          name: "PasswordException",
          code: 1,
        }),
        "OPEN_DOCUMENT",
      ),
    ).toEqual({
      code: "PDF_PASSWORD_PROTECTED",
      diagnostics: {
        exceptionName: "PasswordException",
        exceptionCode: "PASSWORD_REQUIRED",
        stage: "OPEN_DOCUMENT",
      },
    });
    expect(
      classifyPdfParserFailure(
        Object.assign(new Error("remote unsupported detail"), {
          name: "UnknownErrorException",
        }),
        "EXTRACT_TEXT",
      ),
    ).toMatchObject({
      code: "PDF_UNSUPPORTED",
      diagnostics: { stage: "EXTRACT_TEXT" },
    });
  });

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

  it("retains the sanitized source-policy reason after a redirect", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response(null, { status: 404 });
      return new Response(null, {
        status: 301,
        headers: { location: "https://sv.educo.org/" },
      });
    }) as typeof fetch;
    const result = await fetchWebDocument(
      "https://educo.org.sv/wp-content/uploads/2021/05/tdr.pdf",
      deps(fetchImpl, {
        urlPolicy: (url: string) =>
          new URL(url).pathname === "/"
            ? { allowed: false as const, reason: "HOMEPAGE" }
            : { allowed: true as const },
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      code: "BLOCKED_HOST",
      finalUrl: "https://sv.educo.org/",
      detail: "Política de fuente bloqueó el destino: HOMEPAGE",
    });
  });

  it("blocks simulated DNS rebinding between robots and document fetch", async () => {
    let lookups = 0;
    const lookupImpl = vi.fn(async () => {
      lookups += 1;
      return [{ address: lookups < 2 ? "8.8.8.8" : "10.0.0.5", family: 4 }];
    });
    const fetchImpl = robotsThen(new Response("<html>RFP</html>", { headers: { "content-type": "text/html" } }));
    expect(
      await fetchWebDocument(
        "https://rebind.example/rfp",
        deps(fetchImpl, { lookupImpl }),
      ),
    ).toMatchObject({ ok: false, code: "BLOCKED_IP" });
  });

  it("drops a canonical URL that resolves to a private address", async () => {
    const result = await fetchWebDocument(
      "https://buyer.example/notices/rfp",
      deps(
        robotsThen(
          new Response(
            '<html><head><link rel="canonical" href="https://internal.example/rfp"></head><main>Solicitud de propuestas</main></html>',
            { headers: { "content-type": "text/html" } },
          ),
        ),
        {
          lookupImpl: async (host: string) => [
            {
              address: host === "internal.example" ? "10.0.0.5" : "8.8.8.8",
              family: 4,
            },
          ],
        },
      ),
    );
    expect(result).toMatchObject({ ok: true, document: { canonicalUrl: null } });
  });

  it("ignores a cross-origin canonical without resolving or following it", async () => {
    const lookupImpl = vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]);
    const result = await fetchWebDocument(
      "https://buyer.example/notices/rfp",
      deps(
        robotsThen(
          new Response(
            '<html><head><link rel="canonical" href="https://other.example/rfp"></head><main><h1>RFP software</h1></main></html>',
            { headers: { "content-type": "text/html" } },
          ),
        ),
        { lookupImpl },
      ),
    );
    expect(result).toMatchObject({ ok: true, document: { canonicalUrl: null } });
    expect(lookupImpl).toHaveBeenCalledTimes(2);
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

    const missingMime = await fetchWebDocument(
      "https://buyer.example/no-mime",
      deps(
        robotsThen(
          new Response(new TextEncoder().encode("<html><body>RFP</body></html>")),
        ),
      ),
    );
    expect(missingMime).toMatchObject({ ok: false, code: "UNSUPPORTED_CONTENT_TYPE" });

    const fakeHtml = await fetchWebDocument(
      "https://buyer.example/fake-html",
      deps(
        robotsThen(
          new Response("plain text only", { headers: { "content-type": "text/html" } }),
        ),
      ),
    );
    expect(fakeHtml).toMatchObject({ ok: false, code: "UNSUPPORTED_CONTENT_TYPE" });
  });

  it("fails closed when robots.txt exceeds its streaming limit", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("User-agent: *\n".repeat(20), { status: 200 }),
    ) as typeof fetch;
    expect(
      await fetchWebDocument(
        "https://buyer.example/rfp",
        deps(fetchImpl, { maxRobotsBytes: 16 }),
      ),
    ).toMatchObject({ ok: false, code: "ROBOTS_UNAVAILABLE" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("passes only the validated DNS address to each socket request", async () => {
    const lookupImpl = vi
      .fn()
      .mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }])
      .mockResolvedValueOnce([{ address: "1.1.1.1", family: 4 }]);
    const requestImpl = vi.fn(async (
      ...args: [URL, unknown, { address: string; family: 4 | 6 }]
    ) =>
      {
        const url = args[0];
        return (
      url.pathname === "/robots.txt"
        ? new Response("User-agent: *\nDisallow:")
        : new Response("<html><body><h1>RFP</h1></body></html>", {
            headers: { "content-type": "text/html" },
          })
        );
      },
    );
    const result = await fetchWebDocument(
      "https://buyer.example/rfp",
      deps(vi.fn() as unknown as typeof fetch, { requestImpl, lookupImpl }),
    );
    expect(result.ok).toBe(true);
    expect(requestImpl.mock.calls.map((call) => call[2])).toEqual([
      { address: "8.8.8.8", family: 4 },
      { address: "1.1.1.1", family: 4 },
    ]);
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

  it("does not start robots or document requests after global cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    expect(
      await fetchWebDocument(
        "https://buyer.example/rfp",
        deps(fetchImpl, { signal: controller.signal }),
      ),
    ).toMatchObject({ ok: false, code: "TIMEOUT" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("parses a bounded PDF and reports PDFs without text", async () => {
    const pdfResponse = () =>
      new Response(new TextEncoder().encode("%PDF-test\n%%EOF"), {
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

  it("distinguishes PDF parser failures from documents without text", async () => {
    const result = await fetchWebDocument(
      "https://buyer.example/broken.pdf",
      deps(
        robotsThen(
          new Response(new TextEncoder().encode("%PDF-test\n%%EOF"), {
            headers: { "content-type": "application/pdf" },
          }),
        ),
        {
          loadPdfDocument: async () => {
            throw new Error("pdfjs internal secret detail");
          },
        },
      ),
    );

    expect(result).toMatchObject({
      ok: false,
      code: "PDF_PARSE_FAILED",
      detail: "No fue posible procesar el PDF",
      parserFailure: {
        exceptionName: "Error",
        exceptionCode: "UNEXPECTED_PARSER_ERROR",
        stage: "OPEN_DOCUMENT",
      },
    });
    expect(JSON.stringify(result)).not.toContain("pdfjs internal secret detail");
  });

  it("aborts PDF.js while opening and reports the exact parser stage", async () => {
    const fixture = await textualPdf();
    const result = await fetchWebDocument(
      "https://buyer.example/slow.pdf",
      deps(
        robotsThen(
          new Response(Uint8Array.from(fixture), {
            headers: { "content-type": "application/pdf" },
          }),
        ),
        {
          timeoutMs: 5,
          loadPdfDocument: async () =>
            new Promise(() => {
              // The fetcher's AbortSignal must settle this parser operation.
            }),
        },
      ),
    );

    expect(result).toMatchObject({
      ok: false,
      code: "TIMEOUT",
      parserFailure: {
        exceptionName: "AbortException",
        exceptionCode: "ABORTED",
        stage: "OPEN_DOCUMENT",
      },
    });
  });

  it("distinguishes invalid PDF signatures and oversized PDFs", async () => {
    const invalid = await fetchWebDocument(
      "https://buyer.example/invalid.pdf",
      deps(
        robotsThen(
          new Response(new TextEncoder().encode("not-a-pdf"), {
            headers: { "content-type": "application/pdf" },
          }),
        ),
      ),
    );
    const tooLarge = await fetchWebDocument(
      "https://buyer.example/large.pdf",
      deps(
        robotsThen(
          new Response(new TextEncoder().encode("%PDF-test\n%%EOF"), {
            headers: {
              "content-type": "application/pdf",
              "content-length": "6000",
            },
          }),
        ),
      ),
    );

    expect(invalid).toMatchObject({ ok: false, code: "PDF_INVALID_SIGNATURE" });
    expect(tooLarge).toMatchObject({ ok: false, code: "PDF_TOO_LARGE" });
  });

  it("classifies a truncated PDF before invoking pdfjs", async () => {
    const fixture = await textualPdf();
    const truncated = fixture.subarray(0, fixture.length - 24);
    const loadPdfDocument = vi.fn(loadPdfDocumentWithPdfJs);
    const result = await fetchWebDocument(
      "https://buyer.example/truncated.pdf",
      deps(
        robotsThen(
          new Response(Uint8Array.from(truncated), {
            headers: { "content-type": "application/pdf" },
          }),
        ),
        { loadPdfDocument },
      ),
    );

    expect(result).toMatchObject({ ok: false, code: "PDF_TRUNCATED" });
    expect(loadPdfDocument).not.toHaveBeenCalled();
  });

  it("detects an incomplete PDF stream from Content-Length", async () => {
    const fixture = await textualPdf();
    const loadPdfDocument = vi.fn(loadPdfDocumentWithPdfJs);
    const result = await fetchWebDocument(
      "https://buyer.example/incomplete.pdf",
      deps(
        robotsThen(
          new Response(Uint8Array.from(fixture), {
            headers: {
              "content-type": "application/pdf",
              "content-length": String(fixture.byteLength + 10),
            },
          }),
        ),
        { loadPdfDocument },
      ),
    );

    expect(result).toMatchObject({ ok: false, code: "PDF_TRUNCATED" });
    expect(loadPdfDocument).not.toHaveBeenCalled();
  });

  it("rejects a server that ignores the identity content encoding request", async () => {
    const fixture = await textualPdf();
    const loadPdfDocument = vi.fn(loadPdfDocumentWithPdfJs);
    const result = await fetchWebDocument(
      "https://buyer.example/encoded.pdf",
      deps(
        robotsThen(
          new Response(Uint8Array.from(fixture), {
            headers: {
              "content-type": "application/pdf",
              "content-encoding": "gzip",
            },
          }),
        ),
        { loadPdfDocument },
      ),
    );

    expect(result).toMatchObject({
      ok: false,
      code: "UNSUPPORTED_CONTENT_ENCODING",
    });
    expect(loadPdfDocument).not.toHaveBeenCalled();
  });

  it("returns sanitized parser name, code, and exact stage", async () => {
    const fixture = await textualPdf();
    const result = await fetchWebDocument(
      "https://buyer.example/password.pdf",
      deps(
        robotsThen(
          new Response(Uint8Array.from(fixture), {
            headers: { "content-type": "application/pdf" },
          }),
        ),
        {
          loadPdfDocument: async () => {
            throw Object.assign(new Error("password and parser internals"), {
              name: "PasswordException",
              code: 1,
            });
          },
        },
      ),
    );

    expect(result).toMatchObject({
      ok: false,
      code: "PDF_PASSWORD_PROTECTED",
      parserFailure: {
        exceptionName: "PasswordException",
        exceptionCode: "PASSWORD_REQUIRED",
        stage: "OPEN_DOCUMENT",
      },
    });
    expect(JSON.stringify(result)).not.toContain("password and parser internals");
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
