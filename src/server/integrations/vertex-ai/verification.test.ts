import { describe, expect, it, vi } from "vitest";

import {
  areEquivalentUrls,
  normalizeUrl,
  unwrapGoogleUrl,
} from "@/lib/normalization";
import {
  assessSourceSpecificity,
  assessVerificationSourceMatch,
  canPublishVerifiedOpportunity,
  normalizeVerifiedAmount,
  verifyProviderCandidate,
} from "./verification";
import {
  assertNoSearchWithControlledGeneration,
  extractGroundingSources,
  findGroundingSourceForUrl,
  associateCandidatesWithGroundingSources,
  isControlledGenerationToolConflict,
  labelGroundingSources,
} from "./grounding-sources";
import { verifiedOpportunitySchema } from "./schemas";

const candidate = {
  title: "RFP implementación de plataforma de software tributario",
  organizationName: "Banco Demo",
  sourceUrl: "https://buyer.example/procurement/rfp-plataforma-2026",
  snippet: "Solicitud de propuestas para implementar una plataforma de software.",
  category: "SOFTWARE" as const,
};

function verifiedPayload(overrides: Record<string, unknown> = {}) {
  return verifiedOpportunitySchema.parse({
    projectName: candidate.title,
    description: candidate.snippet,
    buyerName: candidate.organizationName,
    category: "SOFTWARE",
    amountStatus: "NOT_PUBLISHED",
    amountValue: null,
    amountMin: null,
    amountMax: null,
    amountCurrency: null,
    publicationDate: null,
    deadline: null,
    sourceTitle: candidate.title,
    sourceIsSpecific: true,
    isSingleOpportunity: true,
    titleConfirmed: true,
    buyerConfirmed: true,
    amountConfirmed: false,
    deadlineConfirmed: false,
    rejectionReason: null,
    evidence: [
      {
        field: "title",
        text: "RFP implementación de plataforma de software tributario",
        url: candidate.sourceUrl,
        confirmed: true,
      },
    ],
    ...overrides,
  });
}

describe("Grounding source metadata", () => {
  it("extracts and deduplicates real Grounding sources with support metadata", () => {
    const sources = extractGroundingSources({
      groundingChunks: [
        { web: { uri: "https://buyer.example/rfp/?utm_source=google", title: "RFP" } },
        { web: { uri: "https://buyer.example/rfp", title: "RFP duplicate" } },
      ],
      groundingSupports: [
        { groundingChunkIndices: [0, 1], confidenceScores: [0.7, 0.9] },
      ],
    });

    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ supportCount: 2, maxConfidence: 0.9 });
  });

  it("rejects a candidate URL not included in Grounding metadata", () => {
    const sources = extractGroundingSources({
      groundingChunks: [{ web: { uri: "https://buyer.example/rfp-1" } }],
    });
    expect(findGroundingSourceForUrl("https://buyer.example/rfp-2", sources)).toBeNull();
  });

  it("associates structured candidates by sourceId and ignores invented sourceIds", () => {
    const labeled = labelGroundingSources(
      extractGroundingSources({
        groundingChunks: [
          { web: { uri: "https://buyer.example/rfp-real", title: "RFP real" } },
        ],
      }),
    );

    const associated = associateCandidatesWithGroundingSources(
      [
        {
          sourceId: "source_1",
          title: "RFP implementación de plataforma",
          organizationName: "Buyer",
        },
        {
          sourceId: "source_99",
          title: "Candidato con sourceId inventado",
        },
      ],
      labeled,
    );

    expect(associated).toHaveLength(1);
    expect(associated[0]?.sourceUrl).toBe("https://buyer.example/rfp-real");
    expect(associated[0]?.title).toContain("plataforma");
  });

  it("detects controlled generation + Search tool conflicts as non-retriable", () => {
    expect(
      isControlledGenerationToolConflict(
        new Error(
          "400 INVALID_ARGUMENT Controlled generation is not supported with the Search tool",
        ),
      ),
    ).toBe(true);
    expect(
      isControlledGenerationToolConflict(new Error("429 RESOURCE_EXHAUSTED")),
    ).toBe(false);
  });

  it("fails when googleSearch is combined with responseSchema / controlled generation", () => {
    expect(() =>
      assertNoSearchWithControlledGeneration({
        tools: [{ googleSearch: {} }],
        responseJsonSchema: { type: "object" },
        responseMimeType: "application/json",
      }),
    ).toThrow(/CONTROLLED_GENERATION_WITH_SEARCH/);

    expect(() =>
      assertNoSearchWithControlledGeneration({
        tools: [{ googleSearch: {} }],
        responseSchema: { type: "object" },
      }),
    ).toThrow(/CONTROLLED_GENERATION_WITH_SEARCH/);

    expect(() =>
      assertNoSearchWithControlledGeneration({
        tools: [{ googleSearch: {} }],
      }),
    ).not.toThrow();

    expect(() =>
      assertNoSearchWithControlledGeneration({
        responseMimeType: "application/json",
        responseJsonSchema: { type: "object" },
      }),
    ).not.toThrow();
  });

  it("normalizes Google wrappers, tracking, fragments, and HTTP/HTTPS variants", () => {
    const wrapped = "https://www.google.com/url?q=https%3A%2F%2Fbuyer.example%2Frfp%2F%3Futm_source%3Dx%23section";
    expect(unwrapGoogleUrl(wrapped)).toContain("buyer.example/rfp");
    expect(normalizeUrl(wrapped)).toBe("https://buyer.example/rfp");
    expect(areEquivalentUrls("http://buyer.example/rfp/", "https://buyer.example/rfp")).toBe(true);
  });
});

describe("source specificity", () => {
  it("accepts a specific opportunity URL with matching page content", () => {
    const result = assessSourceSpecificity({
      finalUrl: candidate.sourceUrl,
      candidate,
      html: `<html><title>${candidate.title}</title><body>Banco Demo solicita propuestas. Fecha límite 2026-08-10.</body></html>`,
    });
    expect(result.specific).toBe(true);
  });

  it("rejects a homepage and a tender index", () => {
    expect(
      assessSourceSpecificity({
        finalUrl: "https://buyer.example/",
        candidate,
        html: "<title>Banco Demo</title>",
      }).specific,
    ).toBe(false);
    expect(
      assessSourceSpecificity({
        finalUrl: "https://buyer.example/licitaciones-publicas",
        candidate,
        html: "<title>Licitaciones</title><a>RFP</a><a>RFP</a><a>RFP</a><a>RFP</a><a>RFP</a>",
      }).specific,
    ).toBe(false);
  });

  it("rejects a generic contractor-profile page that does not match the project", () => {
    const match = assessVerificationSourceMatch({
      candidate: {
        ...candidate,
        title: "Desarrollo de plataforma de billeteo digital Tendios",
        organizationName: "Empresa Concesionaria Demo",
      },
      sourceUrl: "https://www.metromadrid.es/perfil-del-contratante",
      sourceTitle: "Perfil del contratante — Metro Madrid",
      pageTitle: "Perfil del contratante",
      pageText: "Información general del perfil del contratante de Metro Madrid.",
    });
    expect(match.matches).toBe(false);
    expect(match.reason).toBe("VERIFICATION_SOURCE_MISMATCH");
  });
});

describe("verified payload safeguards", () => {
  it("permits an explicitly unpublished amount without blocking publication", () => {
    const payload = verifiedPayload();
    expect(payload.amountStatus).toBe("NOT_PUBLISHED");
    expect(canPublishVerifiedOpportunity(payload, true)).toBe(true);
  });

  it("does not use loan or program financing as a contract amount", () => {
    const normalized = normalizeVerifiedAmount(
      verifiedPayload({
        amountStatus: "PUBLISHED",
        amountValue: 2_000_000,
        amountCurrency: "USD",
        amountConfirmed: true,
        evidence: [
          {
            field: "amount",
            text: "Loan financing for the national digital transformation program: USD 2,000,000",
            url: candidate.sourceUrl,
            confirmed: true,
          },
        ],
      }),
    );
    expect(normalized.amountStatus).toBe("UNKNOWN");
    expect(normalized.amountValue).toBeNull();
  });

  it("does not mark a rejected candidate as publishable", () => {
    const payload = verifiedPayload({ buyerConfirmed: false });
    expect(canPublishVerifiedOpportunity(payload, true)).toBe(false);
  });
});

describe("conditional provider Grounding verification", () => {
  const source = {
    url: candidate.sourceUrl,
    normalizedUrl: candidate.sourceUrl,
    equivalenceKey: "buyer.example/procurement/rfp-plataforma-2026",
    title: candidate.title,
    domain: "buyer.example",
    supportCount: 1,
    maxConfidence: null,
  };

  function verification(status: "VERIFIED" | "PARTIALLY_VERIFIED" | "REJECTED") {
    return {
      status,
      reason: status === "VERIFIED" ? null : "missing evidence",
      originalSourceUrl: candidate.sourceUrl,
      resolvedSourceUrl: candidate.sourceUrl,
      sourceTitle: candidate.title,
      sourceDomain: "buyer.example",
      sourceIsGrounded: false,
      sourceIsSpecific: true,
      titleConfirmed: status !== "REJECTED",
      buyerConfirmed: status === "VERIFIED",
      amountConfirmed: false,
      deadlineConfirmed: false,
      payload: status === "REJECTED" ? null : verifiedPayload(),
      evidence: status === "REJECTED" ? [] : verifiedPayload().evidence,
      sourceUrlValidation: { ok: true },
      verifier: "HTTP_FALLBACK" as const,
    };
  }

  it("does not request Search when the direct source is verified and complete", async () => {
    const verifySource = vi.fn(async () => verification("VERIFIED"));
    const discoverVerificationSource = vi.fn();
    const result = await verifyProviderCandidate(
      {
        candidate: {
          ...candidate,
          deadlineAt: "2026-08-10T00:00:00.000Z",
        },
        source,
        allowGrounding: true,
      },
      { verifySource, discoverVerificationSource },
    );
    expect(result.groundingRequested).toBe(false);
    expect(discoverVerificationSource).not.toHaveBeenCalled();
  });

  it("uses one targeted Grounding lookup for ambiguous candidates", async () => {
    const groundedSource = {
      ...source,
      url: "https://buyer.example/official/rfp.pdf",
      normalizedUrl: "https://buyer.example/official/rfp.pdf",
      equivalenceKey: "buyer.example/official/rfp.pdf",
    };
    const verifySource = vi
      .fn()
      .mockResolvedValueOnce(verification("PARTIALLY_VERIFIED"))
      .mockResolvedValueOnce({
        ...verification("VERIFIED"),
        sourceIsGrounded: true,
        originalSourceUrl: groundedSource.url,
      });
    const result = await verifyProviderCandidate(
      { candidate, source, allowGrounding: true },
      {
        verifySource,
        discoverVerificationSource: async () => ({
          source: groundedSource,
          inputTokens: 20,
          outputTokens: 10,
        }),
      },
    );
    expect(result.groundingRequested).toBe(true);
    expect(result.groundingSucceeded).toBe(true);
    expect(result.groundingInputTokens).toBe(20);
    expect(result.verification).toMatchObject({
      status: "VERIFIED",
      verifier: "GOOGLE_SEARCH_GROUNDING",
      sourceIsGrounded: true,
    });
  });
});
