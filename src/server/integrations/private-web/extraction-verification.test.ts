import { describe, expect, it, vi } from "vitest";

import type { FetchedDocument } from "@/server/services/web-document-fetcher";

import { extractPrivateOpportunityDeterministically } from "./deterministic-extractor";
import { extractPrivateOpportunitiesWithGemini } from "./gemini-extractor";
import { verifyPrivateWebCandidate } from "./verification";

function document(text: string, url = "https://fundacion.org.sv/convocatorias/rfp-software"): FetchedDocument {
  return {
    requestedUrl: url,
    finalUrl: url,
    canonicalUrl: url,
    contentType: "text/html",
    statusCode: 200,
    title: "RFP para desarrollo de software",
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

describe("private web extraction and verification", () => {
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
            candidates: [
              {
                title: "RFP software",
                description: "Desarrollo de software",
                organizationName: "Fundación Ejemplo",
                organizationType: "FOUNDATION",
                category: "SOFTWARE",
                workMode: "UNKNOWN",
                opportunityKind: "RFP",
                publishedAt: null,
                deadlineAt: null,
                estimatedAmount: null,
                currency: null,
                amountStatus: "NOT_PUBLISHED",
                applicationInstructions: null,
                evidence: [
                  { field: "BUYER", text: "Fundación Ejemplo invita" },
                  { field: "SCOPE", text: "Desarrollo de software" },
                  {
                    field: "EXTERNAL_INTENT",
                    text: "invita a presentar propuestas",
                  },
                ],
              },
            ],
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
  });
});
