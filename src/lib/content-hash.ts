import { createHash } from "node:crypto";

export function hashContent(parts: Array<string | null | undefined>): string {
  const payload = parts
    .map((part) => (part ?? "").trim().toLowerCase())
    .join("|");

  return createHash("sha256").update(payload).digest("hex");
}
