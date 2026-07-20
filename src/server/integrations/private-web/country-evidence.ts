import type {
  CountryEvidence,
  CountryEvidenceSignal,
} from "./contracts";

function excerpt(text: string, index: number, length: number): string {
  const start = Math.max(0, text.lastIndexOf("\n", index) + 1);
  const nextLine = text.indexOf("\n", index + length);
  const end = Math.min(text.length, nextLine === -1 ? index + length + 180 : nextLine);
  return text.slice(start, end).replace(/\s+/g, " ").trim().slice(0, 500);
}

function signal(
  kind: string,
  strength: "STRONG" | "WEAK",
  evidence: string,
  sourceUrl: string,
): CountryEvidenceSignal {
  return { kind, strength, evidence, sourceUrl };
}

export function evaluateElSalvadorEvidence(input: {
  text: string;
  sourceUrl: string;
  sourceDomain: string;
}): CountryEvidence {
  const { text, sourceUrl } = input;
  const signals: CountryEvidenceSignal[] = [];
  const contradiction = text.match(
    /(?:lugar|ubicaci[oó]n|pa[ií]s)\s*(?:de ejecuci[oó]n|del proyecto)?\s*[:\-]\s*(Guatemala|Honduras|Nicaragua|Costa Rica|Panam[aá]|M[eé]xico)(?![^.\n]{0,80}El Salvador)/i,
  );
  if (contradiction?.index !== undefined) {
    signals.push(
      signal(
        "EXPLICIT_OTHER_COUNTRY",
        "STRONG",
        excerpt(text, contradiction.index, contradiction[0].length),
        sourceUrl,
      ),
    );
    return {
      countryCode: null,
      decision: "CONTRADICTED",
      confidence: 0,
      signals,
    };
  }

  const strongPatterns: Array<[string, RegExp]> = [
    [
      "EXPLICIT_EXECUTION_LOCATION",
      /(?:lugar|ubicaci[oó]n|zona)\s+(?:de ejecuci[oó]n|del proyecto|de entrega)[^\n.]{0,100}El Salvador/i,
    ],
    [
      "EXPLICIT_SCOPE_IN_SV",
      /(?:servicios|proyecto|implementaci[oó]n|entrega|alcance)[^\n.]{0,140}(?:en|para)\s+El Salvador/i,
    ],
    [
      "SALVADORAN_ADDRESS",
      /(?:direcci[oó]n|domicilio|oficinas?)[^\n.]{0,140}(?:San Salvador|Santa Tecla|Antiguo Cuscatl[aá]n|El Salvador)/i,
    ],
    [
      "CONFIRMED_SALVADORAN_BUYER",
      /(?:empresa|fundaci[oó]n|asociaci[oó]n|universidad|organizaci[oó]n)\s+salvadore[ñn]a/i,
    ],
    [
      "SALVADORAN_CONTRACT_REQUIREMENT",
      /(?:NIT|NRC|IVA|legislaci[oó]n|leyes|requisitos fiscales)[^\n.]{0,120}(?:El Salvador|salvadore[ñn])/i,
    ],
  ];

  for (const [kind, pattern] of strongPatterns) {
    const match = pattern.exec(text);
    if (match?.index !== undefined) {
      signals.push(
        signal(kind, "STRONG", excerpt(text, match.index, match[0].length), sourceUrl),
      );
    }
  }

  if (/\.sv$/i.test(input.sourceDomain)) {
    signals.push(signal("SV_DOMAIN", "WEAK", input.sourceDomain, sourceUrl));
  }
  const mention = /El Salvador/i.exec(text);
  if (mention?.index !== undefined) {
    signals.push(
      signal(
        "ISOLATED_COUNTRY_MENTION",
        "WEAK",
        excerpt(text, mention.index, mention[0].length),
        sourceUrl,
      ),
    );
  }
  const spanishMarkers = text.match(
    /\b(?:solicitud|propuesta|cotizaci[oó]n|proveedor|servicios|fecha|presentar|requisitos)\b/gi,
  );
  if (new Set((spanishMarkers ?? []).map((item) => item.toLowerCase())).size >= 3) {
    signals.push(signal("SPANISH_DOCUMENT", "WEAK", "Documento en español", sourceUrl));
  }

  const strongCount = signals.filter((item) => item.strength === "STRONG").length;
  const weakKinds = new Set(
    signals.filter((item) => item.strength === "WEAK").map((item) => item.kind),
  );
  if (strongCount > 0) {
    return {
      countryCode: "SV",
      decision: "CONFIRMED",
      confidence: Math.min(0.98, 0.85 + (strongCount - 1) * 0.05),
      signals,
    };
  }
  if (weakKinds.size >= 3) {
    return {
      countryCode: "SV",
      decision: "SUPPORTED",
      confidence: Math.min(0.8, 0.7 + (weakKinds.size - 3) * 0.05),
      signals,
    };
  }
  return {
    countryCode: null,
    decision: "AMBIGUOUS",
    confidence: Math.min(0.65, weakKinds.size * 0.2),
    signals,
  };
}

