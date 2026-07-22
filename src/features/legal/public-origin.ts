import "server-only";

import { headers } from "next/headers";

import { legalConfig } from "@/config/legal";

export async function resolvePublicOrigin(): Promise<string | null> {
  if (legalConfig.publicSiteUrl) return legalConfig.publicSiteUrl;

  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host || !/^[a-z0-9.:[\]-]+$/i.test(host)) return null;

  const forwardedProtocol = requestHeaders.get("x-forwarded-proto");
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : host.startsWith("localhost") || host.startsWith("127.0.0.1")
        ? "http"
        : "https";

  return `${protocol}://${host}`;
}
