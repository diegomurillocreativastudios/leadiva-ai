import { describe, expect, it } from "vitest";

import { hashContent } from "@/lib/content-hash";

describe("hashContent", () => {
  it("is stable for equivalent content", () => {
    const a = hashContent(["A", " B ", null]);
    const b = hashContent(["a", "b", undefined]);
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it("changes when content changes", () => {
    expect(hashContent(["one"])).not.toBe(hashContent(["two"]));
  });
});
