import { describe, expect, it } from "vitest";

import {
  buildPrivateRelevanceOptions,
  classifyPrivateCandidate,
  isSalvadoranPublicProcurement,
} from "@/server/integrations/vertex-ai/filters";
import { preparePrivateBatch } from "@/server/integrations/vertex-ai/prepare";
import { STRUCTURE_DISCOVERY_RESPONSE_SCHEMA } from "@/server/integrations/vertex-ai/response-schemas";
import {
  groundingBatchSchema,
  parseGroundingJsonPayload,
} from "@/server/integrations/vertex-ai/schemas";
import {
  buildDefaultPrivateQuery,
  buildDiscoveryQueries,
} from "@/server/integrations/vertex-ai/query";
import { buildDiscoverPrivateOpportunitiesPrompt } from "@/server/integrations/vertex-ai/prompts/discover-private-opportunities.prompt";
import {
  countOpportunityBlocks,
  diagnoseGroundingPipeline,
} from "@/server/integrations/vertex-ai/grounding-diagnostics";

const now = new Date("2026-07-15T12:00:00.000Z");

function groundingSource(url: string) {
  const parsed = new URL(url);
  return {
    url,
    normalizedUrl: url,
    equivalenceKey: `${parsed.hostname}${parsed.pathname}`,
    title: "Fuente Grounding",
    domain: parsed.hostname,
    supportCount: 1,
    maxConfidence: 0.9,
  };
}

describe("STRUCTURE_DISCOVERY_RESPONSE_SCHEMA", () => {
  it("omits nested maxItems so Vertex constrained decoding stays within state limits", () => {
    const candidates = STRUCTURE_DISCOVERY_RESPONSE_SCHEMA.properties.candidates;
    expect(candidates).not.toHaveProperty("maxItems");
    expect(candidates.items).not.toHaveProperty("maxItems");
    expect(candidates.items.properties).not.toHaveProperty("minLength");
    expect(candidates.items.properties.title).not.toHaveProperty("maxLength");
    expect(candidates.items.properties.estimatedAmount).not.toHaveProperty(
      "maximum",
    );
    expect(candidates.items.properties.deadlineAt).not.toHaveProperty("format");
  });
});

describe("parseGroundingJsonPayload", () => {
  it("parses raw and fenced JSON", () => {
    expect(
      parseGroundingJsonPayload('{"candidates":[]}'),
    ).toEqual({ candidates: [] });
    expect(
      parseGroundingJsonPayload('```json\n{"candidates":[{"title":"A","sourceUrl":"https://a.com"}]}\n```'),
    ).toMatchObject({
      candidates: [{ title: "A" }],
    });
  });

  it("reports invalid JSON instead of silently accepting it", () => {
    expect(() => parseGroundingJsonPayload('{"candidates":')).toThrow();
  });
});

describe("groundingBatchSchema", () => {
  it("validates a grounded batch", () => {
    const batch = groundingBatchSchema.parse({
      candidates: [
        {
          title: "RFP desarrollo de software municipal",
          organizationName: "Acme Corp",
          sourceUrl: "https://acme.example/rfp",
          snippet: "Solicitud de propuestas de software",
          category: "SOFTWARE",
          countryCode: "sv",
          contractingSector: "PUBLIC",
          estimatedAmount: 145000,
          currency: "usd",
        },
      ],
      citations: [{ uri: "https://acme.example/rfp", title: "RFP" }],
      searchQueries: ["software RFP El Salvador"],
      inputTokens: 10,
      outputTokens: 20,
      configured: true,
    });

    expect(batch.candidates).toHaveLength(1);
    expect(batch.candidates[0]?.countryCode).toBe("SV");
    expect(batch.candidates[0]?.contractingSector).toBe("PUBLIC");
    expect(batch.candidates[0]?.estimatedAmount).toBe(145000);
    expect(batch.candidates[0]?.currency).toBe("USD");
  });
});

describe("isSalvadoranPublicProcurement", () => {
  it("detects .gob.sv and comprasal sources", () => {
    expect(
      isSalvadoranPublicProcurement({
        sourceUrl: "https://compras.gob.sv/licitacion/1",
        contractingSector: "PUBLIC",
        countryCode: "SV",
        organizationName: "Ministerio de Hacienda",
      }),
    ).toBe(true);
  });

  it("does not treat foreign public RFPs as Salvadoran just because countryCode is SV", () => {
    expect(
      isSalvadoranPublicProcurement({
        sourceUrl: "https://www.naspovaluepoint.org/solicitations/open-rfp",
        contractingSector: "PUBLIC",
        countryCode: "SV",
        organizationName: "NASPO ValuePoint",
        title: "Open RFP Software",
      }),
    ).toBe(false);
  });
});

describe("classifyPrivateCandidate", () => {
  const relevance = buildPrivateRelevanceOptions({
    interestCategories: ["SOFTWARE", "IT", "CONSULTING", "AI"],
  });

  it("accepts software RFPs", () => {
    const decision = classifyPrivateCandidate(
      {
        title: "RFP desarrollo de software institucional",
        organizationName: "Banco Demo",
        sourceUrl: "https://banco.example/proveedores/rfp-software",
        snippet: "Solicitud de propuestas para plataforma web",
        category: "SOFTWARE",
      },
      relevance,
      now,
    );
    expect(decision.accept).toBe(true);
    if (decision.accept) {
      expect(decision.score).toBeGreaterThan(0);
    }
  });

  it("rejects jobs and courses", () => {
    expect(
      classifyPrivateCandidate(
        {
          title: "Vacante desarrollador",
          sourceUrl: "https://jobs.example/empleo",
          snippet: "Hiring software engineer",
        },
        relevance,
        now,
      ).accept,
    ).toBe(false);

    expect(
      classifyPrivateCandidate(
        {
          title: "Curso de inteligencia artificial",
          sourceUrl: "https://edu.example/curso-ia",
          snippet: "Capacitación online",
        },
        relevance,
        now,
      ).accept,
    ).toBe(false);
  });

  it("rejects job opportunities phrasing in URL or text", () => {
    expect(
      classifyPrivateCandidate(
        {
          title: "Servicios de Consultoría Individual para Técnico en TI",
          organizationName: "IADB",
          sourceUrl:
            "https://www.iadb.org/en/project-notices/op00456175/promoting-job-opportunities-and-skills-development",
          snippet: "Consultoría individual desarrollo de software",
          category: "SOFTWARE",
        },
        relevance,
        now,
      ).accept,
    ).toBe(false);
  });

  it("rejects expired deadlines", () => {
    const decision = classifyPrivateCandidate(
      {
        title: "Consultoría de software",
        organizationName: "Org",
        sourceUrl: "https://org.example/rfp",
        snippet: "RFP consultoría software",
        category: "CONSULTING",
        deadlineAt: "2026-01-01T00:00:00.000Z",
      },
      relevance,
      now,
    );
    expect(decision.accept).toBe(false);
    if (!decision.accept) {
      expect(decision.reason).toBe("EXPIRED");
    }
  });

  it("does not mark clearly software-related titles as IRRELEVANT even when category is OTHER", () => {
    const decision = classifyPrivateCandidate(
      {
        title:
          "Convenio Marco para la adquisición de Servicios de Desarrollo y Mantención de Software, Servicios Profesionales TI y Cloud Computing",
        organizationName: "Empresa Privada Demo",
        sourceUrl: "https://empresa.example/proveedores/convenio-marco-software-2026",
        snippet:
          "Licitación privada vigente para desarrollo de software, servicios profesionales TI y cloud computing.",
        category: "OTHER",
        contractingSector: "PRIVATE",
      },
      relevance,
      now,
    );
    expect(decision.accept).toBe(true);
    if (decision.accept) {
      expect(["SOFTWARE", "CONSULTING", "IT"]).toContain(decision.category);
    }
  });

  it("marks ChileCompra and other public buyers as PUBLIC_SECTOR, not IRRELEVANT", () => {
    const decision = classifyPrivateCandidate(
      {
        title:
          "Convenio Marco para la adquisición de Servicios de Desarrollo y Mantención de Software, Servicios Profesionales TI y Cloud Computing",
        organizationName: "Dirección ChileCompra",
        sourceUrl: "https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=123",
        snippet: "Convenio marco ChileCompra para software y cloud.",
        category: "OTHER",
        contractingSector: "PUBLIC",
      },
      relevance,
      now,
    );
    expect(decision.accept).toBe(false);
    if (!decision.accept) {
      expect(decision.reason).toBe("PUBLIC_SECTOR");
      expect(decision.detail.toLowerCase()).not.toMatch(/software, it, consultoría/);
    }
  });

  it("rejects competitor marketing / company service pages", () => {
    const escalemais = classifyPrivateCandidate(
      {
        title:
          "Consultoría Tecnológica en San Salvador, El Salvador - Escale Mais",
        organizationName: "Escale Mais",
        sourceUrl:
          "https://escalemais.com/consultoria-tecnologica-san-salvador-el-salvador",
        snippet:
          "¿Busca una empresa de consultoría tecnológica en San Salvador? En Escale Mais ofrecemos servicios de consultoría de software",
        category: "SOFTWARE",
      },
      relevance,
      now,
    );
    expect(escalemais.accept).toBe(false);
    if (!escalemais.accept) {
      expect(escalemais.reason).toBe("IRRELEVANT");
    }

    const takhyon = classifyPrivateCandidate(
      {
        title:
          "Takhyon | Desarrollo de Software e Inteligencia Artificial en El Salvador",
        organizationName: "Takhyon",
        sourceUrl: "https://www.takhyon.com/",
        snippet:
          "Empresa de desarrollo de software, automatización con IA y consultoría tecnológica en El Salvador",
        category: "SOFTWARE",
      },
      relevance,
      now,
    );
    expect(takhyon.accept).toBe(false);
    if (!takhyon.accept) {
      expect(takhyon.reason).toBe("IRRELEVANT");
    }
  });

  it("rejects vendor directories, tender aggregators, and document mirrors", () => {
    expect(
      classifyPrivateCandidate(
        {
          title: "Top Software Developers in El Salvador",
          organizationName: "Clutch.co",
          sourceUrl: "https://clutch.co/sv/developers/software",
          snippet: "Highly reviewed software developers",
          category: "SOFTWARE",
        },
        relevance,
        now,
      ).accept,
    ).toBe(false);

    expect(
      classifyPrivateCandidate(
        {
          title: "Latest Call Centers Software Tenders in El Salvador 2026",
          organizationName: "ElsalvadorTenders",
          sourceUrl: "https://elsalvadortenders.com/call-centers-software-tenders",
          snippet: "Find latest government Call Centers Software tenders",
          category: "SOFTWARE",
        },
        relevance,
        now,
      ).accept,
    ).toBe(false);

    expect(
      classifyPrivateCandidate(
        {
          title: "Request for Proposal ERP Software System",
          organizationName: "SCCOE",
          sourceUrl: "https://www.scribd.com/document/123/rfp-erp",
          snippet: "RFP software proposals due May 2026",
          category: "SOFTWARE",
        },
        relevance,
        now,
      ).accept,
    ).toBe(false);
  });

  it("rejects pages without a buyer tender / RFP signal", () => {
    const decision = classifyPrivateCandidate(
      {
        title: "Desarrollo de software a la medida",
        organizationName: "Agencia Demo",
        sourceUrl: "https://agencia.example/servicios/software",
        snippet: "Ofrecemos consultoría tecnológica y sistemas empresariales",
        category: "SOFTWARE",
      },
      relevance,
      now,
    );
    expect(decision.accept).toBe(false);
    if (!decision.accept) {
      expect(decision.reason).toBe("IRRELEVANT");
      expect(decision.detail.toLowerCase()).toMatch(
        /licitaci|rfp|tender|compra|marketing|servicio/,
      );
    }
  });

  it("accepts corporate vendor-portal tenders", () => {
    const decision = classifyPrivateCandidate(
      {
        title: "Convocatoria a proveedores — implementación de ERP",
        organizationName: "Industrias Centro",
        sourceUrl: "https://industrias.example/proveedores/licitacion-erp-2026",
        snippet:
          "Licitación privada para desarrollo de software ERP. Plazo de recepción de propuestas.",
        category: "SOFTWARE",
        contractingSector: "PRIVATE",
        estimatedAmount: 72000,
        currency: "USD",
      },
      relevance,
      now,
    );
    expect(decision.accept).toBe(true);
  });

  it("rejects tenders without an identifiable buying organization", () => {
    const decision = classifyPrivateCandidate(
      {
        title: "RFP desarrollo de software institucional",
        sourceUrl: "https://portal.example/proveedores/rfp-software",
        snippet: "Solicitud de propuestas para plataforma web",
        category: "SOFTWARE",
      },
      relevance,
      now,
    );
    expect(decision.accept).toBe(false);
    if (!decision.accept) {
      expect(decision.reason).toBe("IRRELEVANT");
      expect(decision.detail.toLowerCase()).toMatch(/organizaci/);
    }
  });
});

describe("preparePrivateBatch", () => {
  it("dedupes by URL and maps accepted candidates", () => {
    const result = preparePrivateBatch({
      sourceType: "PRIVATE_WEB",
      query: "software RFP",
      now,
      groundingSources: [groundingSource("https://acme.example/rfp")],
      candidates: [
        {
          title: "RFP software",
          organizationName: "Acme",
          sourceUrl: "https://acme.example/rfp",
          snippet: "Desarrollo de software",
          category: "SOFTWARE",
        },
        {
          title: "RFP software duplicado",
          organizationName: "Acme",
          sourceUrl: "https://acme.example/rfp",
          snippet: "Desarrollo de software",
          category: "SOFTWARE",
        },
      ],
    });

    expect(result.accepted).toHaveLength(1);
    expect(result.discardCounts.DUPLICATE_IN_BATCH).toBe(1);
    expect(result.accepted[0]?.mapped.verificationStatus).toBe("PENDING");
    expect(result.accepted[0]?.mapped.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.accepted[0]?.mapped.rawData).toMatchObject({
      discoveryOnly: true,
      notVerifiedByGoogleAlone: true,
    });
  });

  it("dedupes same opportunity with different URLs by title and organization", () => {
    const result = preparePrivateBatch({
      sourceType: "PRIVATE_WEB",
      query: "software RFP",
      now,
      groundingSources: [
        groundingSource("https://www.iadb.org/en/project-details/p179829"),
        groundingSource("https://www.iadb.org/en/procurement/other-page"),
      ],
      candidates: [
        {
          title:
            "RFP: Servicios de Consultoría Individual para Técnico en Tecnologías de Información (Desarrollo de Software)",
          organizationName: "IADB",
          sourceUrl: "https://www.iadb.org/en/project-details/p179829",
          snippet: "Solicitud de propuestas para consultoría de desarrollo de software",
          category: "SOFTWARE",
        },
        {
          title:
            "RFP: Servicios de Consultoría Individual para Técnico en Tecnologías de Información (Desarrollo de Software)",
          organizationName: "IADB",
          sourceUrl: "https://www.iadb.org/en/procurement/other-page",
          snippet: "Misma oportunidad con otra URL",
          category: "SOFTWARE",
        },
      ],
    });

    expect(result.accepted).toHaveLength(1);
    expect(result.discardCounts.DUPLICATE_IN_BATCH).toBe(1);
  });

  it("excludes all public-sector RFPs from private web search as PUBLIC_SECTOR", () => {
    const result = preparePrivateBatch({
      sourceType: "PRIVATE_WEB",
      query: "ERP RFP",
      now,
      groundingSources: [
        groundingSource("https://www.sccoe.org/purchasing/rfp-erp-2026"),
        groundingSource("https://compras.gob.sv/licitacion/erp-2026"),
        groundingSource("https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?id=1"),
        groundingSource("https://acme.example/proveedores/rfp-erp-2026"),
      ],
      candidates: [
        {
          title: "Request for Proposal RFP ERP Software System",
          organizationName: "Santa Clara County Office of Education",
          sourceUrl: "https://www.sccoe.org/purchasing/rfp-erp-2026",
          snippet:
            "SCCOE seeks proposals for a cloud-based ERP software system. Proposal deadline included.",
          category: "SOFTWARE",
          countryCode: "US",
          contractingSector: "PUBLIC",
        },
        {
          title: "Licitación pública desarrollo de software ERP institucional",
          organizationName: "Ministerio de Hacienda",
          sourceUrl: "https://compras.gob.sv/licitacion/erp-2026",
          snippet: "Convocatoria pública para desarrollo de software ERP.",
          category: "SOFTWARE",
          countryCode: "SV",
          contractingSector: "PUBLIC",
        },
        {
          title:
            "Convenio Marco para la adquisición de Servicios de Desarrollo y Mantención de Software",
          organizationName: "Dirección ChileCompra",
          sourceUrl:
            "https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?id=1",
          snippet: "ChileCompra convenio marco software.",
          category: "OTHER",
          countryCode: "CL",
          contractingSector: "PUBLIC",
        },
        {
          title: "RFP privada desarrollo de software ERP",
          organizationName: "Acme Corp",
          sourceUrl: "https://acme.example/proveedores/rfp-erp-2026",
          snippet: "Licitación privada para desarrollo de software ERP.",
          category: "SOFTWARE",
          countryCode: "US",
          contractingSector: "PRIVATE",
        },
      ],
    });

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.candidate.organizationName).toBe("Acme Corp");
    expect(result.discardCounts.PUBLIC_SECTOR).toBe(3);
  });
});

describe("buildDiscoveryQueries", () => {
  it("returns independent global intents without mandatory geography", () => {
    const queries = buildDiscoveryQueries(["SOFTWARE"], new Date("2026-07-16T12:00:00.000Z"));
    expect(queries.length).toBeGreaterThanOrEqual(8);
    expect(queries.some((q) => /request for proposal|open RFP/i.test(q))).toBe(true);
    expect(queries.some((q) => /digital agency RFP|currently accepting/i.test(q))).toBe(true);
    expect(queries.some((q) => /convocatoria/i.test(q))).toBe(true);

    const globalQueries = queries.filter(
      (q) => !/El Salvador|Centroamérica|Latinoamérica/i.test(q),
    );
    expect(globalQueries.length).toBeGreaterThanOrEqual(5);
    for (const query of globalQueries) {
      expect(query).not.toMatch(/El Salvador|Centroamérica|LatAm/i);
      expect(query).not.toContain("-agencia");
      expect(query).not.toContain("nuestros servicios");
      expect(query).not.toContain("quiénes somos");
      expect(query).not.toContain("about us");
    }
  });

  it("biases search intents toward still-open deadlines after today", () => {
    const queries = buildDiscoveryQueries(
      ["SOFTWARE"],
      new Date("2026-07-16T12:00:00.000Z"),
    );
    expect(queries.some((q) => /open RFP|currently accepting|proposals due|vigente|abierta/i.test(q))).toBe(
      true,
    );
    expect(queries.some((q) => /August|September|October|agosto|septiembre|octubre/i.test(q))).toBe(
      true,
    );
    expect(queries.every((q) => !/"deadline 2026"$/i.test(q.trim()))).toBe(true);
  });

  it("includes a few complementary regional queries", () => {
    const queries = buildDiscoveryQueries(["SOFTWARE", "AI"]);
    const regional = queries.filter((q) =>
      /El Salvador|Centroamérica|Latinoamérica/i.test(q),
    );
    expect(regional.length).toBeGreaterThanOrEqual(2);
    expect(regional.length).toBeLessThan(queries.length / 2);
  });
});

describe("buildDefaultPrivateQuery", () => {
  it("lists discovery intents instead of one mega boolean query", () => {
    const query = buildDefaultPrivateQuery(["SOFTWARE", "AI"]);
    expect(query).toMatch(/request for proposal|open RFP/i);
    expect(query).toContain("2026");
    expect(query).not.toMatch(/^\(SOFTWARE/);
    expect(query).not.toContain("(El Salvador OR Centroamérica OR LatAm)");
    expect(query).not.toContain("-agencia");
    expect(query).not.toContain("nuestros servicios");
  });
});

describe("buildDiscoverPrivateOpportunitiesPrompt", () => {
  it("asks for global discovery and does not require region in every search", () => {
    const prompt = buildDiscoverPrivateOpportunitiesPrompt({
      discoveryQueries: [
        '"open RFP" software development "proposals due" August 2026',
        "RFP desarrollo software Centroamérica 2026",
      ],
      sourceType: "PRIVATE_WEB",
      maxCandidates: 10,
      interestCategories: ["SOFTWARE"],
      currentDate: "2026-07-16",
    });

    expect(prompt).toContain("2026-07-16");
    expect(prompt).toMatch(/Do not require.*(El Salvador|Centroamérica|LatAm)/i);
    expect(prompt).toContain("[OPPORTUNITY]");
    expect(prompt).toContain("Do not invent");
    expect(prompt).toMatch(/open RFP|proposals due/i);
    expect(prompt).toMatch(/still.open|AFTER 2026-07-16|on or before 2026-07-16/i);
    expect(prompt).toContain("Run these search intents:");
  });
});

describe("grounding diagnostics", () => {
  it("counts opportunity blocks in discovery text", () => {
    const text = `
[OPPORTUNITY]
Title: Cloud migration RFP
Organization: Acme Corp
[/OPPORTUNITY]
[OPPORTUNITY]
Title: AI consulting RFP
Organization: Beta Inc
[/OPPORTUNITY]
`;
    expect(countOpportunityBlocks(text)).toBe(2);
  });

  it("also counts UNVERIFIED blocks for diagnostics", () => {
    const text = `
[UNVERIFIED]
Title: Possible open RFP
Organization: Org
[OPPORTUNITY]
Title: Confirmed RFP
Organization: Buyer
[/OPPORTUNITY]
`;
    expect(countOpportunityBlocks(text)).toBe(2);
  });

  it("identifies where candidates are lost in the pipeline", () => {
    expect(
      diagnoseGroundingPipeline({
        groundingChunksFound: 0,
        discoveryTextLength: 0,
        opportunityBlocksFound: 0,
        structuredCandidatesFound: 0,
        webSearchQueriesCount: 12,
      }),
    ).toBe("SEARCH_QUERIES_WITHOUT_CHUNKS");

    expect(
      diagnoseGroundingPipeline({
        groundingChunksFound: 0,
        discoveryTextLength: 0,
        opportunityBlocksFound: 0,
        structuredCandidatesFound: 0,
      }),
    ).toBe("NO_GROUNDING_SOURCES");

    expect(
      diagnoseGroundingPipeline({
        groundingChunksFound: 4,
        discoveryTextLength: 0,
        opportunityBlocksFound: 0,
        structuredCandidatesFound: 0,
      }),
    ).toBe("SOURCES_WITHOUT_TEXT");

    expect(
      diagnoseGroundingPipeline({
        groundingChunksFound: 4,
        discoveryTextLength: 800,
        opportunityBlocksFound: 0,
        structuredCandidatesFound: 0,
      }),
    ).toBe("PARSER_OR_STRUCTURE_FAILED");

    expect(
      diagnoseGroundingPipeline({
        groundingChunksFound: 4,
        discoveryTextLength: 800,
        opportunityBlocksFound: 2,
        structuredCandidatesFound: 2,
      }),
    ).toBe("OK");
  });
});
