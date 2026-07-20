import { describe, expect, it } from "vitest";

import {
  assertSafePublicHttpUrl,
  isPrivateOrReservedIp,
} from "@/server/security/safe-url";

describe("isPrivateOrReservedIp", () => {
  it("blocks loopback, private, and link-local ranges", () => {
    expect(isPrivateOrReservedIp("127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("10.0.0.5")).toBe(true);
    expect(isPrivateOrReservedIp("192.168.1.10")).toBe(true);
    expect(isPrivateOrReservedIp("172.16.4.1")).toBe(true);
    expect(isPrivateOrReservedIp("169.254.169.254")).toBe(true);
    expect(isPrivateOrReservedIp("192.0.2.1")).toBe(true);
    expect(isPrivateOrReservedIp("0.0.0.0")).toBe(true);
    expect(isPrivateOrReservedIp("::1")).toBe(true);
    expect(isPrivateOrReservedIp("fc00::1")).toBe(true);
    expect(isPrivateOrReservedIp("fe90::1")).toBe(true);
    expect(isPrivateOrReservedIp("fec0::1")).toBe(true);
    expect(isPrivateOrReservedIp("ff02::1")).toBe(true);
    expect(isPrivateOrReservedIp("2001:db8::1")).toBe(true);
    expect(isPrivateOrReservedIp("::ffff:7f00:1")).toBe(true);
    expect(isPrivateOrReservedIp("::7f00:1")).toBe(true);
    expect(isPrivateOrReservedIp("::ffff:192.168.1.1")).toBe(true);
    expect(isPrivateOrReservedIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("::ffff:0:7f00:1")).toBe(true);
    expect(isPrivateOrReservedIp("64:ff9b::7f00:1")).toBe(true);
    expect(isPrivateOrReservedIp("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("::ffff:192.168.1.1")).toBe(true);
    expect(isPrivateOrReservedIp("fe80::1")).toBe(true);
    expect(isPrivateOrReservedIp("ff00::1")).toBe(true);
    expect(isPrivateOrReservedIp("999.1.1.1")).toBe(true);
  });

  it("allows public addresses", () => {
    expect(isPrivateOrReservedIp("8.8.8.8")).toBe(false);
    expect(isPrivateOrReservedIp("190.86.1.20")).toBe(false);
    expect(isPrivateOrReservedIp("2001:4860:4860::8888")).toBe(false);
    expect(isPrivateOrReservedIp("::808:808")).toBe(true);
  });
});

describe("assertSafePublicHttpUrl", () => {
  it("rejects non-http protocols and local hosts", () => {
    expect(assertSafePublicHttpUrl("file:///etc/passwd").ok).toBe(false);
    expect(assertSafePublicHttpUrl("http://localhost/rfp").ok).toBe(false);
    expect(assertSafePublicHttpUrl("http://127.0.0.1/rfp").ok).toBe(false);
    expect(assertSafePublicHttpUrl("http://169.254.169.254/latest").ok).toBe(
      false,
    );
    expect(assertSafePublicHttpUrl("not-a-url").ok).toBe(false);
  });

  it("accepts public https URLs structurally", () => {
    const result = assertSafePublicHttpUrl(
      "https://www.comprasal.gob.sv/proceso/123",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url.hostname).toBe("www.comprasal.gob.sv");
    }
  });
});
