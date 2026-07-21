import { describe, expect, it, vi } from "vitest";

import type { FetchedDocument } from "@/server/services/web-document-fetcher";

import { extractPrivateOpportunityDeterministically } from "./deterministic-extractor";
import {
  classifyGeminiFailure,
  extractPrivateOpportunitiesWithGemini,
  PRIVATE_WEB_GEMINI_RESPONSE_SCHEMA,
  sanitizeZodIssuePath,
} from "./gemini-extractor";
import { verifyPrivateWebCandidate } from "./verification";

function document(text: string, url = "https://fundacion.org.sv/convocatorias/rfp-software"): FetchedDocument {
  return {
    requestedUrl: url,
    finalUrl: url,
    canonicalUrl: url,
    contentType: "text/html",
    statusCode: 200,
    title: "RFP para desarrollo de software",
    titleSource: "DOCUMENT_HEADING",
    text,
    links: [],
    byteLength: new TextEncoder().encode(text).byteLength,
    fetchedAt: "2026-07-20T12:00:00.000Z",
    pdfPagesProcessed: 0,
  };
}

const validText = `
Fundación Innovación Salvadoreña invita a presentar propuestas de proveedores externos.
Convocatoria abierta para empresas y consultores.
Objetivo: desarrollo e implementación de software para la gestión de beneficiarios.
Lugar de ejecución del proyecto: El Salvador.
Fecha de publicación: 15/07/2026.
Fecha límite: 31/12/2027.
El monto del contrato es USD 25,000.00.
Enviar la propuesta al correo compras@fundacion.org.sv antes de la fecha límite.
`;

const validGeminiCandidate = {
  title: "RFP software",
  description: "Desarrollo de software",
  organizationName: "Fundación Ejemplo",
  organizationType: "FOUNDATION" as const,
  category: "SOFTWARE" as const,
  workMode: "UNKNOWN" as const,
  opportunityKind: "RFP" as const,
  publishedAt: null,
  deadlineAt: null,
  estimatedAmount: null,
  currency: null,
  amountStatus: "NOT_PUBLISHED" as const,
  applicationInstructions: null,
  evidence: [
    { field: "BUYER" as const, text: "Fundación Ejemplo invita" },
    { field: "SCOPE" as const, text: "Desarrollo de software" },
    {
      field: "EXTERNAL_INTENT" as const,
      text: "invita a presentar propuestas",
    },
  ],
};

async function extractGeminiPayload(payload: unknown) {
  return extractPrivateOpportunitiesWithGemini(
    {
      document: document(validText),
      query: "desarrollo de software",
      maxOutputTokens: 2_000,
    },
    {
      model: "test-model",
      generateContent: async () => ({
        text: JSON.stringify(payload),
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      }),
    },
  );
}

describe("private web extraction and verification", () => {
  it("keeps nested array limits out of the Vertex response schema", () => {
    const candidates = PRIVATE_WEB_GEMINI_RESPONSE_SCHEMA.properties.candidates;
    const evidence = candidates.items.properties.evidence;

    expect(candidates).not.toHaveProperty("maxItems");
    expect(evidence).not.toHaveProperty("maxItems");
  });

  it("accepts up to five candidates and rejects a larger local response", async () => {
    const accepted = await extractGeminiPayload({
      candidates: Array.from({ length: 5 }, () => validGeminiCandidate),
    });
    const rejected = await extractGeminiPayload({
      candidates: Array.from({ length: 6 }, () => validGeminiCandidate),
    });

    expect(accepted.candidates).toHaveLength(5);
    expect(accepted.failureKind).toBeNull();
    expect(rejected).toMatchObject({
      candidates: [],
      failureKind: "INVALID_RESPONSE",
    });
  });

  it("keeps the valid root and rejects only a candidate with excess evidence", async () => {
    const evidence = Array.from({ length: 24 }, (_, index) => ({
      field: "SCOPE" as const,
      text: `Evidencia ${index + 1}`,
    }));
    const accepted = await extractGeminiPayload({
      candidates: [{ ...validGeminiCandidate, evidence }],
    });
    const rejected = await extractGeminiPayload({
      candidates: [
        {
          ...validGeminiCandidate,
          evidence: [...evidence, { field: "SCOPE", text: "Evidencia 25" }],
        },
      ],
    });

    expect(accepted.candidates[0]?.evidence).toHaveLength(24);
    expect(accepted.failureKind).toBeNull();
    expect(rejected).toMatchObject({
      candidates: [],
      failureKind: null,
      invalidCandidates: [
        expect.objectContaining({
          issueCode: "too_big",
          path: "evidence",
          issueCount: 1,
        }),
      ],
    });
  });

  it("retains a valid Gemini candidate beside an invalid candidate", async () => {
    const extracted = await extractGeminiPayload({
      candidates: [
        validGeminiCandidate,
        { ...validGeminiCandidate, category: "NOT_A_CATEGORY" },
      ],
    });
    expect(extracted.failureKind).toBeNull();
    expect(extracted.candidates).toHaveLength(1);
    expect(extracted.invalidCandidates).toEqual([
      {
        issueCode: "invalid_value",
        path: "category",
        issueCount: 1,
      },
    ]);
    expect(JSON.stringify(extracted.invalidCandidates)).not.toContain(
      "NOT_A_CATEGORY",
    );
  });

  it("sanitizes Zod paths and treats a missing candidates root as invalid", async () => {
    expect(
      sanitizeZodIssuePath([
        "evidence",
        0,
        "../../prompt-secret",
        Symbol("remote-secret"),
      ]),
    ).toBe("evidence[0]");
    const extracted = await extractGeminiPayload({ result: [] });
    expect(extracted).toMatchObject({
      candidates: [],
      failureKind: "INVALID_RESPONSE",
      invalidCandidates: [],
    });
  });

  it("classifies Gemini failures without exposing provider messages", () => {
    expect(
      classifyGeminiFailure(
        Object.assign(new Error("remote detail that must not be persisted"), {
          status: 400,
        }),
      ),
    ).toBe("INVALID_ARGUMENT");
    expect(classifyGeminiFailure(new DOMException("Aborted", "AbortError"))).toBe(
      "TIMEOUT",
    );
    expect(classifyGeminiFailure({ code: "RESOURCE_EXHAUSTED" })).toBe(
      "RESOURCE_EXHAUSTED",
    );
  });

  it("extracts and verifies a fully grounded private opportunity", () => {
    const source = document(validText);
    const candidate = extractPrivateOpportunityDeterministically({
      document: source,
      query: "desarrollo de software",
    });
    expect(candidate).not.toBeNull();
    expect(candidate).toMatchObject({
      organizationName: "Fundación Innovación Salvadoreña",
      opportunityKind: "RFP",
      estimatedAmount: "25000.00",
      currency: "USD",
      extractionMethod: "DETERMINISTIC",
    });
    const result = verifyPrivateWebCandidate({
      candidate: candidate!,
      document: source,
      query: "desarrollo de software",
      now: new Date("2026-07-20T12:00:00.000Z"),
    });
    expect(result).toMatchObject({
      verificationStatus: "VERIFIED",
      countryCode: "SV",
      contractingSector: "PRIVATE",
      deadlineAt: "2028-01-01T05:59:59.999Z",
    });
  });

  it("allows partial verification only when deadline alone is missing", () => {
    const source = document(
      validText.replace("Fecha límite: 31/12/2027.", "Se recibirán propuestas mientras la convocatoria permanezca abierta."),
    );
    const candidate = extractPrivateOpportunityDeterministically({
      document: source,
      query: "desarrollo de software",
    });
    const result = verifyPrivateWebCandidate({
      candidate: candidate!,
      document: source,
      query: "desarrollo de software",
      now: new Date("2026-07-20T12:00:00.000Z"),
    });
    expect(result).toMatchObject({
      verificationStatus: "PARTIALLY_VERIFIED",
      deadlineAt: null,
      verificationReason: "Fecha límite no confirmada. Requiere revisión manual.",
    });
  });

  it("drops unsupported fields and uses the deadline scanned from the source", () => {
    const source = document(validText);
    const candidate = extractPrivateOpportunityDeterministically({
      document: source,
      query: "desarrollo de software",
    });
    const result = verifyPrivateWebCandidate({
      candidate: {
        ...candidate!,
        publishedAt: "2029-01-01",
        deadlineAt: "2029-12-31",
        estimatedAmount: "10",
      },
      document: source,
      query: "desarrollo de software",
      now: new Date("2026-07-20T12:00:00.000Z"),
    });
    expect(result).toMatchObject({
      verificationStatus: "VERIFIED",
      publishedAt: null,
      deadlineAt: "2028-01-01T05:59:59.999Z",
      estimatedAmount: null,
      amountStatus: "NOT_PUBLISHED",
    });
  });

  it("rejects expired, ambiguous-country and query-mismatched sources", () => {
    const expiredDocument = document(
      validText.replace("31/12/2027", "31/12/2025"),
    );
    const expired = extractPrivateOpportunityDeterministically({
      document: expiredDocument,
      query: "desarrollo de software",
    });
    expect(
      verifyPrivateWebCandidate({
        candidate: { ...expired!, deadlineAt: "2029-12-31" },
        document: expiredDocument,
        query: "desarrollo de software",
        now: new Date("2026-07-20T12:00:00.000Z"),
      }),
    ).toMatchObject({ status: "REJECTED", reasonCode: "EXPIRED" });

    const ambiguousDocument = document(
      validText.replace("Lugar de ejecución del proyecto: El Salvador.", "El proyecto se ejecutará de forma remota."),
      "https://buyer.com/convocatorias/rfp-software",
    );
    const ambiguous = extractPrivateOpportunityDeterministically({
      document: ambiguousDocument,
      query: "desarrollo de software",
    });
    expect(
      verifyPrivateWebCandidate({
        candidate: ambiguous!,
        document: ambiguousDocument,
        query: "desarrollo de software",
      }),
    ).toMatchObject({ status: "REJECTED", reasonCode: "COUNTRY_NOT_CONFIRMED" });

    const mismatch = extractPrivateOpportunityDeterministically({
      document: document(validText),
      query: "mobiliario de oficina",
    });
    expect(
      verifyPrivateWebCandidate({
        candidate: mismatch!,
        document: document(validText),
        query: "mobiliario de oficina",
      }),
    ).toMatchObject({ status: "REJECTED", reasonCode: "QUERY_MISMATCH" });
  });

  it("keeps the first reject reason and all additional failed gates", () => {
    const source = document(validText.replace("31/12/2027", "31/12/2025"));
    const candidate = extractPrivateOpportunityDeterministically({
      document: source,
      query: "desarrollo de software",
    })!;
    const result = verifyPrivateWebCandidate({
      candidate: {
        ...candidate,
        evidence: candidate.evidence.filter((item) =>
          ["TITLE", "COUNTRY", "TEMPORAL"].includes(item.field),
        ),
      },
      document: source,
      query: "mobiliario de oficina",
      now: new Date("2026-07-20T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      status: "REJECTED",
      reasonCode: "MISSING_BUYER",
      primaryRejectReason: "MISSING_BUYER",
      secondaryRejectReasons: expect.arrayContaining([
        "MISSING_SCOPE",
        "MISSING_EXTERNAL_INTENT",
        "PUBLIC_OR_UNKNOWN_SECTOR",
        "QUERY_MISMATCH",
        "EXPIRED",
      ]),
    });
  });

  it("does not treat a company offering its own services as an opportunity", () => {
    expect(
      extractPrivateOpportunityDeterministically({
        document: document(
          "Somos una empresa de software. Nuestros servicios ayudan a crecer. Solicita una propuesta comercial y contáctanos.",
        ),
        query: "desarrollo de software",
      }),
    ).toBeNull();
  });

  it("does not infer a title when the source has no verifiable title", () => {
    const source = {
      ...document(validText),
      title: null,
    };
    expect(
      extractPrivateOpportunityDeterministically({
        document: source,
        query: "desarrollo de software",
      }),
    ).toBeNull();
  });

  it("uses a same-URL Brave title with explicit TITLE provenance", () => {
    const titled = document(validText);
    const candidate = extractPrivateOpportunityDeterministically({
      document: titled,
      query: "desarrollo de software",
    })!;
    const source = { ...titled, title: null, titleSource: null };
    const result = verifyPrivateWebCandidate({
      candidate,
      document: source,
      query: "desarrollo de software",
      now: new Date("2026-07-20T12:00:00.000Z"),
      braveResult: {
        title: "Solicitud de propuestas de software",
        url: source.finalUrl,
      },
    });

    expect(result).toMatchObject({
      verificationStatus: "VERIFIED",
      title: "Solicitud de propuestas de software",
      titleSource: "BRAVE_RESULT",
      evidence: expect.arrayContaining([
        expect.objectContaining({
          field: "TITLE",
          text: "Solicitud de propuestas de software",
          confirmed: true,
        }),
      ]),
    });
  });

  it.each([
    {
      label: "a different URL",
      braveResult: {
        title: "Solicitud de propuestas de software",
        url: "https://otra-fundacion.org.sv/convocatorias/rfp-software",
      },
    },
    {
      label: "a generic title",
      braveResult: {
        title: "PDF",
        url: "https://fundacion.org.sv/convocatorias/rfp-software",
      },
    },
    { label: "no title", braveResult: undefined },
  ])("rejects a missing document title with $label", ({ braveResult }) => {
    const titled = document(validText);
    const candidate = extractPrivateOpportunityDeterministically({
      document: titled,
      query: "desarrollo de software",
    })!;
    const source = { ...titled, title: null, titleSource: null };

    expect(
      verifyPrivateWebCandidate({
        candidate,
        document: source,
        query: "desarrollo de software",
        braveResult,
      }),
    ).toMatchObject({ status: "REJECTED", reasonCode: "MISSING_TITLE" });
  });

  it("prefers a literal document heading when Brave contradicts it", () => {
    const source = {
      ...document(validText),
      title: "Convocatoria para plataforma de beneficiarios",
      titleSource: "DOCUMENT_HEADING" as const,
    };
    const candidate = extractPrivateOpportunityDeterministically({
      document: source,
      query: "desarrollo de software",
    })!;
    const result = verifyPrivateWebCandidate({
      candidate,
      document: source,
      query: "desarrollo de software",
      now: new Date("2026-07-20T12:00:00.000Z"),
      braveResult: {
        title: "Auditoría financiera anual",
        url: source.finalUrl,
      },
    });

    expect(result).toMatchObject({
      verificationStatus: "VERIFIED",
      title: "Convocatoria para plataforma de beneficiarios",
      titleSource: "DOCUMENT_HEADING",
    });
  });

  it("preserves an explicit deadline time instead of extending it to end of day", () => {
    const source = document(
      validText.replace(
        "Fecha límite: 31/12/2027.",
        "Fecha límite: 31/12/2027 a las 14:30.",
      ),
    );
    const candidate = extractPrivateOpportunityDeterministically({
      document: source,
      query: "desarrollo de software",
    });
    expect(
      verifyPrivateWebCandidate({
        candidate: candidate!,
        document: source,
        query: "desarrollo de software",
        now: new Date("2026-07-20T12:00:00Z"),
      }),
    ).toMatchObject({
      verificationStatus: "VERIFIED",
      deadlineAt: "2027-12-31T20:30:00.000Z",
    });
  });

  it("sends only downloaded text and metadata to Gemini without tools", async () => {
    const generateContent = vi.fn(
      async (request: {
        model: string;
        contents: string;
        config: Record<string, unknown>;
      }) => {
        void request;
        return {
          text: JSON.stringify({
            candidates: [validGeminiCandidate],
          }),
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        };
      },
    );
    const source = document(validText);
    const result = await extractPrivateOpportunitiesWithGemini(
      {
        document: source,
        query: "desarrollo de software",
        maxOutputTokens: 2_000,
      },
      { generateContent, model: "test-model" },
    );
    expect(result.candidates).toHaveLength(1);
    const request = generateContent.mock.calls[0]?.[0];
    expect(request?.contents).toContain(validText.trim());
    expect(request?.contents).toContain("Consulta del usuario: desarrollo de software");
    expect(request?.config).not.toHaveProperty("tools");
    expect(request?.config.responseJsonSchema).toBe(
      PRIVATE_WEB_GEMINI_RESPONSE_SCHEMA,
    );
  });
});
