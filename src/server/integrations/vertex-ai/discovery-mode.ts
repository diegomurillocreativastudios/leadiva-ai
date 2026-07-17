export function resolvePrivateDiscoveryMode(
  sourceType: "PRIVATE_WEB" | "LINKEDIN",
  configuredMode: "GROUNDING_ONLY" | "PROVIDER_SEARCH",
): "GROUNDING_ONLY" | "PROVIDER_SEARCH" {
  return sourceType === "PRIVATE_WEB" ? configuredMode : "GROUNDING_ONLY";
}

export async function executePrivateDiscoveryMode<T>(
  mode: "GROUNDING_ONLY" | "PROVIDER_SEARCH",
  runners: {
    grounding: () => Promise<T>;
    provider: () => Promise<T>;
  },
): Promise<T> {
  return mode === "PROVIDER_SEARCH"
    ? runners.provider()
    : runners.grounding();
}

