import { describe, expect, it, vi } from "vitest";

import {
  executePrivateDiscoveryMode,
  resolvePrivateDiscoveryMode,
} from "./discovery-mode";

describe("private discovery feature flag", () => {
  it("keeps LinkedIn and the default private mode on Grounding", () => {
    expect(
      resolvePrivateDiscoveryMode("PRIVATE_WEB", "GROUNDING_ONLY"),
    ).toBe("GROUNDING_ONLY");
    expect(resolvePrivateDiscoveryMode("LINKEDIN", "PROVIDER_SEARCH")).toBe(
      "GROUNDING_ONLY",
    );
  });

  it("does not invoke the provider runner in GROUNDING_ONLY", async () => {
    const grounding = vi.fn(async () => "grounding");
    const provider = vi.fn(async () => "provider");
    expect(
      await executePrivateDiscoveryMode("GROUNDING_ONLY", {
        grounding,
        provider,
      }),
    ).toBe("grounding");
    expect(grounding).toHaveBeenCalledOnce();
    expect(provider).not.toHaveBeenCalled();
  });

  it("selects the provider runner only when explicitly enabled", async () => {
    const grounding = vi.fn(async () => "grounding");
    const provider = vi.fn(async () => "provider");
    expect(
      await executePrivateDiscoveryMode("PROVIDER_SEARCH", {
        grounding,
        provider,
      }),
    ).toBe("provider");
    expect(provider).toHaveBeenCalledOnce();
    expect(grounding).not.toHaveBeenCalled();
  });
});
