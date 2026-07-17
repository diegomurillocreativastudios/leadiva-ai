import "server-only";

import { assertSafePublicHttpUrl } from "@/server/security/safe-url";
import {
  defaultPublicHostLookup,
  resolveAndAssertPublicHost,
  type SourceUrlValidationDeps,
} from "./source-url-validation";

export type RobotsDecision = {
  allowed: boolean;
  reason: "ALLOWED" | "ROBOTS_DISALLOWED" | "ROBOTS_UNAVAILABLE";
  robotsUrl: string;
  fromCache: boolean;
};

type RobotsCacheEntry = {
  expiresAt: number;
  text: string | null;
  unavailable: boolean;
};

export type RobotsPolicyDeps = Pick<
  SourceUrlValidationDeps,
  "fetchImpl" | "lookupImpl" | "timeoutMs" | "now"
> & {
  userAgent: string;
  cacheTtlMs: number;
  cache?: Map<string, RobotsCacheEntry>;
};

const sharedRobotsCache = new Map<string, RobotsCacheEntry>();

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pathMatches(pattern: string, path: string): boolean {
  if (!pattern) {
    return false;
  }
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const expression = escapeRegExp(body).replace(/\\\*/g, ".*");
  return new RegExp(`^${expression}${anchored ? "$" : ""}`).test(path);
}

type RobotsRule = { allow: boolean; path: string };

export function isPathAllowedByRobots(
  robotsText: string,
  userAgent: string,
  path: string,
): boolean {
  const groups: Array<{ agents: string[]; rules: RobotsRule[] }> = [];
  let current: { agents: string[]; rules: RobotsRule[] } | null = null;
  let rulesStarted = false;

  for (const rawLine of robotsText.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) {
      continue;
    }
    const separator = line.indexOf(":");
    if (separator < 0) {
      continue;
    }
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "user-agent") {
      if (!current || rulesStarted) {
        current = { agents: [], rules: [] };
        groups.push(current);
        rulesStarted = false;
      }
      current.agents.push(value.toLowerCase());
      continue;
    }
    if ((field === "allow" || field === "disallow") && current) {
      current.rules.push({ allow: field === "allow", path: value });
      rulesStarted = true;
    }
  }

  const normalizedAgent = userAgent.toLowerCase();
  const matching = groups.filter((group) =>
    group.agents.some(
      (agent) => agent === "*" || normalizedAgent.includes(agent),
    ),
  );
  const specific = matching.filter((group) =>
    group.agents.some((agent) => agent !== "*" && normalizedAgent.includes(agent)),
  );
  const rules = (specific.length > 0 ? specific : matching).flatMap(
    (group) => group.rules,
  );
  const matches = rules
    .filter((rule) => rule.path && pathMatches(rule.path, path))
    .sort(
      (left, right) =>
        right.path.replace(/\*/g, "").length -
          left.path.replace(/\*/g, "").length ||
        Number(right.allow) - Number(left.allow),
    );
  return matches[0]?.allow ?? true;
}

export async function checkRobotsAllowed(
  rawUrl: string,
  deps: RobotsPolicyDeps,
): Promise<RobotsDecision> {
  const structural = assertSafePublicHttpUrl(rawUrl);
  const fallbackRobotsUrl = (() => {
    try {
      return new URL("/robots.txt", rawUrl).toString();
    } catch {
      return rawUrl;
    }
  })();
  if (!structural.ok) {
    return {
      allowed: false,
      reason: "ROBOTS_UNAVAILABLE",
      robotsUrl: fallbackRobotsUrl,
      fromCache: false,
    };
  }

  const robotsUrl = new URL("/robots.txt", structural.url.origin).toString();
  const cache = deps.cache ?? sharedRobotsCache;
  const nowMs = (deps.now?.() ?? new Date()).getTime();
  let cached = cache.get(structural.url.origin);
  let fromCache = Boolean(cached && cached.expiresAt > nowMs);

  if (!cached || cached.expiresAt <= nowMs) {
    const lookupImpl = deps.lookupImpl ?? defaultPublicHostLookup;
    const dnsFailure = await resolveAndAssertPublicHost(
      structural.url.hostname,
      lookupImpl,
    );
    if (dnsFailure) {
      return {
        allowed: false,
        reason: "ROBOTS_UNAVAILABLE",
        robotsUrl,
        fromCache: false,
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 8_000);
    try {
      const response = await (deps.fetchImpl ?? fetch)(robotsUrl, {
        method: "GET",
        redirect: "manual",
        credentials: "omit",
        signal: controller.signal,
        headers: {
          Accept: "text/plain,*/*;q=0.1",
          "User-Agent": deps.userAgent,
        },
      });
      if (response.status === 404 || response.status === 410) {
        cached = { expiresAt: nowMs + deps.cacheTtlMs, text: null, unavailable: false };
      } else if (!response.ok || (response.status >= 300 && response.status < 400)) {
        cached = { expiresAt: nowMs + Math.min(deps.cacheTtlMs, 300_000), text: null, unavailable: true };
      } else {
        const text = (await response.text()).slice(0, 500_000);
        cached = { expiresAt: nowMs + deps.cacheTtlMs, text, unavailable: false };
      }
      cache.set(structural.url.origin, cached);
      fromCache = false;
    } catch {
      cached = { expiresAt: nowMs + Math.min(deps.cacheTtlMs, 300_000), text: null, unavailable: true };
      cache.set(structural.url.origin, cached);
      fromCache = false;
    } finally {
      clearTimeout(timer);
    }
  }

  if (cached.unavailable) {
    return { allowed: false, reason: "ROBOTS_UNAVAILABLE", robotsUrl, fromCache };
  }
  if (!cached.text) {
    return { allowed: true, reason: "ALLOWED", robotsUrl, fromCache };
  }
  const path = `${structural.url.pathname}${structural.url.search}`;
  const allowed = isPathAllowedByRobots(cached.text, deps.userAgent, path);
  return {
    allowed,
    reason: allowed ? "ALLOWED" : "ROBOTS_DISALLOWED",
    robotsUrl,
    fromCache,
  };
}

