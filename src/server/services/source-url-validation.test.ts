import { describe, expect, it, vi } from "vitest";

import { validateSourceUrl } from "@/server/services/source-url-validation";

describe("validateSourceUrl", () => {
  it("rejects unsafe hosts without fetching", async () => {
    const fetchImpl = vi.fn();
    const result = await validateSourceUrl("http://127.0.0.1/secret", {
      fetchImpl,
      lookupImpl: async () => [{ address: "127.0.0.1", family: 4 }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("BLOCKED_IP");
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects when DNS resolves to a private IP", async () => {
    const fetchImpl = vi.fn();
    const result = await validateSourceUrl("https://evil.example/rfp", {
      fetchImpl,
      lookupImpl: async () => [{ address: "10.1.2.3", family: 4 }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("BLOCKED_IP");
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("accepts reachable convocatoria URLs with public DNS", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(null, {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    const result = await validateSourceUrl(
      "https://banco.example/proveedores/rfp-2026",
      {
        fetchImpl: fetchImpl as typeof fetch,
        lookupImpl: async () => [{ address: "190.86.1.20", family: 4 }],
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.statusCode).toBe(200);
      expect(result.finalUrl).toContain("banco.example");
      expect(result.checkedAt).toBeTruthy();
    }
    expect(fetchImpl).toHaveBeenCalled();
  });

  it("rejects unreachable or error HTTP statuses", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }));

    const result = await validateSourceUrl(
      "https://portal.example/proveedores/missing",
      {
        fetchImpl: fetchImpl as typeof fetch,
        lookupImpl: async () => [{ address: "1.1.1.1", family: 4 }],
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("HTTP_ERROR");
      expect(result.statusCode).toBe(404);
    }
  });

  it("re-validates redirect targets and rejects private redirect hops", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("public.example")) {
        return new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest" },
        });
      }
      return new Response(null, { status: 200 });
    });

    const result = await validateSourceUrl("https://public.example/rfp", {
      fetchImpl: fetchImpl as typeof fetch,
      lookupImpl: async () => [{ address: "1.1.1.1", family: 4 }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("BLOCKED_IP");
    }
  });

  it("falls back from HEAD to GET when HEAD is not allowed", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "HEAD") {
        return new Response(null, { status: 405 });
      }
      return new Response("<html>ok</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    });

    const result = await validateSourceUrl("https://docs.example/tdr.pdf", {
      fetchImpl: fetchImpl as typeof fetch,
      lookupImpl: async () => [{ address: "8.8.8.8", family: 4 }],
    });

    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("resolves and reports the final URL after a safe redirect", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("short.example")) {
        return new Response(null, {
          status: 302,
          headers: { location: "https://buyer.example/rfp-2026" },
        });
      }
      return new Response(null, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    });

    const result = await validateSourceUrl("https://short.example/rfp", {
      fetchImpl: fetchImpl as typeof fetch,
      lookupImpl: async () => [{ address: "8.8.8.8", family: 4 }],
    });

    expect(result).toMatchObject({ ok: true, finalUrl: "https://buyer.example/rfp-2026" });
  });

  it("rejects unsupported content types and DNS failures without treating them as valid", async () => {
    const image = await validateSourceUrl("https://buyer.example/logo.png", {
      fetchImpl: vi.fn(async () => new Response(null, {
        status: 200,
        headers: { "content-type": "image/png" },
      })) as typeof fetch,
      lookupImpl: async () => [{ address: "8.8.8.8", family: 4 }],
    });
    expect(image).toMatchObject({ ok: false, code: "UNSUPPORTED_CONTENT_TYPE" });

    const dns = await validateSourceUrl("https://missing.example/rfp", {
      lookupImpl: async () => {
        throw new Error("NXDOMAIN");
      },
    });
    expect(dns).toMatchObject({ ok: false, code: "DNS_FAILED" });
  });
});
