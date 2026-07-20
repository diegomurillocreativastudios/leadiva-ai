import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("COMPRASAL available configuration", () => {
  it("fails in a controlled way for invalid operational limits", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/leadiva_test");
    vi.stubEnv("AUTH_SECRET", "01234567890123456789012345678901");
    vi.stubEnv("COMPRASAL_AVAILABLE_MAX_ROWS", "0");
    const { getServerEnv } = await import("./server");
    expect(() => getServerEnv()).toThrow(/COMPRASAL_AVAILABLE_MAX_ROWS/);
  });

  it("rejects a per_page value above the confirmed COMPRASAL maximum", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/leadiva_test");
    vi.stubEnv("AUTH_SECRET", "01234567890123456789012345678901");
    vi.stubEnv("COMPRASAL_AVAILABLE_PER_PAGE", "1001");
    const { getServerEnv } = await import("./server");
    expect(() => getServerEnv()).toThrow(/COMPRASAL_AVAILABLE_PER_PAGE/);
  });

  it("rejects an invalid available-results limit", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/leadiva_test");
    vi.stubEnv("AUTH_SECRET", "01234567890123456789012345678901");
    vi.stubEnv("COMPRASAL_AVAILABLE_MAX_MATCHES", "0");
    const { getServerEnv } = await import("./server");
    expect(() => getServerEnv()).toThrow(
      /COMPRASAL_AVAILABLE_MAX_MATCHES/,
    );
  });

  it("rejects an invalid award-report cache TTL", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/leadiva_test");
    vi.stubEnv("AUTH_SECRET", "01234567890123456789012345678901");
    vi.stubEnv("COMPRASAL_AWARD_REPORT_CACHE_TTL_MS", "999");
    const { getServerEnv } = await import("./server");
    expect(() => getServerEnv()).toThrow(
      /COMPRASAL_AWARD_REPORT_CACHE_TTL_MS/,
    );
  });

  it("rejects an invalid process-detail cache TTL", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/leadiva_test");
    vi.stubEnv("AUTH_SECRET", "01234567890123456789012345678901");
    vi.stubEnv("COMPRASAL_PROCESS_DETAIL_CACHE_TTL_MS", "999");
    const { getServerEnv } = await import("./server");
    expect(() => getServerEnv()).toThrow(
      /COMPRASAL_PROCESS_DETAIL_CACHE_TTL_MS/,
    );
  });

  it("uses documented defaults when optional values are absent", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/leadiva_test");
    vi.stubEnv("AUTH_SECRET", "01234567890123456789012345678901");
    vi.stubEnv("COMPRASAL_AVAILABLE_PER_PAGE", undefined);
    vi.stubEnv("COMPRASAL_AVAILABLE_MAX_PAGES", undefined);
    vi.stubEnv("COMPRASAL_AVAILABLE_CACHE_TTL_MS", undefined);
    vi.stubEnv("COMPRASAL_AWARD_REPORT_CACHE_TTL_MS", undefined);
    vi.stubEnv("COMPRASAL_PROCESS_DETAIL_CACHE_TTL_MS", undefined);
    vi.stubEnv("COMPRASAL_AVAILABLE_MAX_ROWS", undefined);
    vi.stubEnv("COMPRASAL_AVAILABLE_MAX_MATCHES", undefined);
    vi.stubEnv("COMPRASAL_AVAILABLE_TIME_BUDGET_MS", undefined);
    const { getServerEnv } = await import("./server");
    const env = getServerEnv();
    expect(env).toMatchObject({
      COMPRASAL_AVAILABLE_PER_PAGE: 1000,
      COMPRASAL_AVAILABLE_MAX_PAGES: 100,
      COMPRASAL_AVAILABLE_CACHE_TTL_MS: 300000,
      COMPRASAL_AWARD_REPORT_CACHE_TTL_MS: 300000,
      COMPRASAL_PROCESS_DETAIL_CACHE_TTL_MS: 300000,
      COMPRASAL_AVAILABLE_MAX_ROWS: 10000,
      COMPRASAL_AVAILABLE_MAX_MATCHES: 250,
      COMPRASAL_AVAILABLE_TIME_BUDGET_MS: 240000,
    });
  });
});

describe("PRIVATE_WEB Brave configuration", () => {
  function baseEnv() {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/leadiva_test");
    vi.stubEnv("AUTH_SECRET", "01234567890123456789012345678901");
  }

  it("is disabled by default and exposes the approved hard-limit defaults", async () => {
    baseEnv();
    vi.stubEnv("PRIVATE_WEB_BRAVE_ENABLED", undefined);
    vi.stubEnv("BRAVE_API_KEY", undefined);
    vi.stubEnv("BRAVE_SEARCH_API_KEY", undefined);
    const { getServerEnv } = await import("./server");
    expect(getServerEnv()).toMatchObject({
      PRIVATE_WEB_BRAVE_ENABLED: false,
      PRIVATE_WEB_MAX_BRAVE_REQUESTS: 8,
      PRIVARESULTS: 160,
      PRIVATE_WEB_MAX_UNIQUE_URLS: 60,
      PRIVATE_WEB_MAX_DOCUMENT_FETCHES: 10,
      PRIVATE_WEB_MAX_GEMINI_EXTRACTIONS: 6,
      PRIVATE_WEB_MAX_RESULTS: 50,
      PRIVATE_WEB_MAX_PER_DOMAIN: 3,
      PRIVATE_WEB_TOTAL_TIMEOUT_MS: 180000,
    });
  });

  it("prefers BRAVE_API_KEY and falls back to the legacy alias", async () => {
    baseEnv();
    vi.stubEnv("BRAVE_API_KEY", "canonical-key");
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "legacy-key");
    let serverModule = await import("./server");
    expect(serverModule.getServerEnv().BRAVE_API_KEY).toBe("canonical-key");

    vi.resetModules();
    vi.stubEnv("BRAVE_API_KEY", undefined);
    serverModule = await import("./server");
    expect(serverModule.getServerEnv().BRAVE_API_KEY).toBe("legacy-key");
  });
});
