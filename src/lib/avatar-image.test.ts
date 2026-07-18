import { describe, expect, it } from "vitest";

import {
  AVATAR_MAX_BYTES,
  detectImageMimeFromBytes,
  isAllowedAvatarMimeType,
  validateAvatarDataUrl,
} from "@/lib/avatar-image";

function toDataUrl(mime: string, bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

describe("isAllowedAvatarMimeType", () => {
  it("accepts jpeg, png and webp", () => {
    expect(isAllowedAvatarMimeType("image/jpeg")).toBe(true);
    expect(isAllowedAvatarMimeType("image/png")).toBe(true);
    expect(isAllowedAvatarMimeType("image/webp")).toBe(true);
    expect(isAllowedAvatarMimeType("image/gif")).toBe(false);
  });
});

describe("detectImageMimeFromBytes", () => {
  it("detects jpeg and png signatures", () => {
    expect(detectImageMimeFromBytes(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0))).toBe(
      "image/jpeg",
    );
    expect(
      detectImageMimeFromBytes(
        Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
      ),
    ).toBe("image/png");
  });
});

describe("validateAvatarDataUrl", () => {
  it("accepts a valid jpeg data url", () => {
    const dataUrl = toDataUrl(
      "image/jpeg",
      Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10),
    );
    const result = validateAvatarDataUrl(dataUrl);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mimeType).toBe("image/jpeg");
    }
  });

  it("rejects mismatched mime and payload", () => {
    const dataUrl = toDataUrl(
      "image/png",
      Uint8Array.of(0xff, 0xd8, 0xff, 0xe0),
    );
    const result = validateAvatarDataUrl(dataUrl);
    expect(result.ok).toBe(false);
  });

  it("rejects oversized payloads", () => {
    const oversized = new Uint8Array(AVATAR_MAX_BYTES + 8);
    oversized[0] = 0xff;
    oversized[1] = 0xd8;
    oversized[2] = 0xff;
    const result = validateAvatarDataUrl(toDataUrl("image/jpeg", oversized));
    expect(result.ok).toBe(false);
  });
});
