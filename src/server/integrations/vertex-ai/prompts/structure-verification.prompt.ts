export const STRUCTURE_VERIFICATION_PROMPT_VERSION = "v1";

export function buildStructureVerificationPrompt(params: {
  sourceUrl: string;
  rawText: string;
}): string {
  return [
    "You normalize a free-form opportunity verification response into strict JSON.",
    "Do not browse the web. Do not invent facts that are not supported by the raw text.",
    `Verified source URL (use this exact URL in evidence.url): ${params.sourceUrl}`,
    "Return ONLY valid JSON matching the verification schema fields.",
    "",
    "RAW VERIFICATION TEXT:",
    params.rawText.slice(0, 20_000),
  ].join("\n");
}
