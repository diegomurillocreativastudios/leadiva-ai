import { describe, expect, it, vi } from "vitest";

import {
  checkRobotsAllowed,
  isPathAllowedByRobots,
} from "./robots-policy";

describe("robots policy", () => {
  it("uses the longest matching allow/disallow rule", () => {
    const robots = `
      User-agent: *
      Disallow: /private/
      Allow: /private/rfp-public
    `;
    expect(isPathAllowedByRobots(robots, "CreativaLeadsBot/1.0", "/private/a")).toBe(false);
    expect(
      isPathAllowedByRobots(
        robots,
        "CreativaLeadsBot/1.0",
        "/private/rfp-public",
      ),
    ).toBe(true);
  });

  it("caches robots.txt by origin", async () => {
    const cache = new Map();
    const fetchImpl = vi.fn(async () =>
      new Response("User-agent: *\nDisallow:", { status: 200 }),
    ) as typeof fetch;
    const deps = {
      fetchImpl,
      lookupImpl: async () => [{ address: "8.8.8.8", family: 4 }],
      now: () => new Date("2026-07-16T00:00:00Z"),
      userAgent: "CreativaLeadsBot/1.0",
      cacheTtlMs: 60_000,
      cache,
    };
    expect((await checkRobotsAllowed("https://buyer.example/a", deps)).allowed).toBe(true);
    expect((await checkRobotsAllowed("https://buyer.example/b", deps)).fromCache).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

