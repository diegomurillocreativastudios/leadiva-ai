/**
 * Vertex responseJsonSchema payloads for controlled generation.
 *
 * Keep these schemas shallow: no maxItems on nested object arrays, no
 * min/max/length/format constraints. Those explode constrained-decoding
 * state ("too many states for serving"). Enforce limits via prompt + Zod.
 */

export const STRUCTURE_DISCOVERY_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["candidates"],
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "sourceId",
          "title",
          "organizationName",
          "snippet",
          "category",
          "countryCode",
          "workMode",
          "contractingSector",
          "estimatedAmount",
          "currency",
          "deadlineAt",
        ],
        properties: {
          sourceId: { type: "string" },
          title: { type: "string" },
          organizationName: { type: ["string", "null"] },
          snippet: { type: ["string", "null"] },
          category: {
            type: ["string", "null"],
            enum: ["SOFTWARE", "IT", "CONSULTING", "AI", "OTHER", null],
          },
          countryCode: { type: ["string", "null"] },
          workMode: {
            type: ["string", "null"],
            enum: ["ONSITE", "REMOTE", "HYBRID", "UNKNOWN", null],
          },
          contractingSector: {
            type: ["string", "null"],
            enum: ["PUBLIC", "PRIVATE", "UNKNOWN", null],
          },
          estimatedAmount: { type: ["number", "null"] },
          currency: { type: ["string", "null"] },
          deadlineAt: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;
