import "server-only";

export type LegalLocale = "es" | "en";

export type ConfigurableLegalValue = {
  value: string | null;
  placeholder: Record<LegalLocale, string>;
  reviewLabel: Record<LegalLocale, string>;
};

export type RetentionCategory =
  | "accountInformation"
  | "activeLeads"
  | "closedLeads"
  | "linkedinResponses"
  | "oauthTokens"
  | "auditLogs"
  | "technicalLogs"
  | "privacyRequests"
  | "backups";

export type DetectedProvider = {
  id: string;
  name: string;
  purpose: Record<LegalLocale, string>;
  status: "confirmed-in-code" | "planned-not-implemented";
  publishByName: boolean;
  reviewNote: Record<LegalLocale, string>;
};

const pending = (
  placeholderEs: string,
  placeholderEn: string,
): ConfigurableLegalValue => ({
  value: null,
  placeholder: { es: placeholderEs, en: placeholderEn },
  reviewLabel: {
    es: "Pendiente de confirmación antes de publicar",
    en: "Pending confirmation before publication",
  },
});

const confirmed = (
  valueEs: string,
  valueEn: string = valueEs,
): ConfigurableLegalValue => ({
  value: valueEs,
  placeholder: { es: valueEs, en: valueEn },
  reviewLabel: {
    es: "Confirmado",
    en: "Confirmed",
  },
});

/** Localized confirmed values use the locale-specific placeholder when set. */
function confirmedLocalized(
  valueEs: string,
  valueEn: string,
): ConfigurableLegalValue {
  return {
    value: valueEs,
    placeholder: { es: valueEs, en: valueEn },
    reviewLabel: {
      es: "Confirmado",
      en: "Confirmed",
    },
  };
}

const pendingRetention = pending(
  "[PERIODO PENDIENTE DE DEFINICIÓN LEGAL Y OPERATIVA]",
  "[RETENTION PERIOD PENDING LEGAL AND OPERATIONAL DEFINITION]",
);

function normalizeSiteUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    return url.origin;
  } catch {
    return null;
  }
}

const deploymentSiteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.VERCEL_PROJECT_PRODUCTION_URL ??
  process.env.VERCEL_URL;

export const legalConfig = {
  legalEntityName: confirmed("Creativa Consultores S.A. de C.V."),
  tradeName: "Creativa Studios",
  productName: "Leadiva AI",
  country: "El Salvador",
  legalAddress: confirmed(
    "Colonia San Benito, Avenida La Capilla #321, San Salvador, El Salvador",
  ),
  contactEmail: confirmed("hi@creativastudios.us"),
  effectiveDate: confirmedLocalized(
    "22 de julio de 2026",
    "July 22, 2026",
  ),
  lastUpdatedDate: confirmedLocalized(
    "22 de julio de 2026",
    "July 22, 2026",
  ),
  publicSiteUrl: normalizeSiteUrl(deploymentSiteUrl),
  privacyPolicyUrlEs: "/es/politica-de-privacidad",
  privacyPolicyUrlEn: "/en/privacy-policy",
  dataDeletionUrl: null as string | null,
  providers: [
    {
      id: "neon",
      name: "Neon",
      purpose: {
        es: "Base de datos PostgreSQL de la aplicación.",
        en: "The application's PostgreSQL database.",
      },
      status: "confirmed-in-code",
      publishByName: false,
      reviewNote: {
        es: "Confirmar cuenta, región, contrato y rol de encargado antes de nombrarlo en la política publicada.",
        en: "Confirm the account, region, contract, and processor role before naming it in the published policy.",
      },
    },
    {
      id: "google-cloud-vertex-ai",
      name: "Google Cloud Vertex AI / Gemini",
      purpose: {
        es: "Descubrimiento, extracción, clasificación y evaluación de oportunidades comerciales.",
        en: "Discovery, extraction, classification, and evaluation of commercial opportunities.",
      },
      status: "confirmed-in-code",
      publishByName: true,
      reviewNote: {
        es: "Confirmar configuración productiva, región y términos contractuales. El código no envía respuestas de LinkedIn Lead Sync.",
        en: "Confirm the production configuration, region, and contractual terms. The code does not send LinkedIn Lead Sync responses.",
      },
    },
    {
      id: "brave-search",
      name: "Brave Search API",
      purpose: {
        es: "Descubrimiento de fuentes web públicas sobre oportunidades privadas.",
        en: "Discovery of public web sources concerning private opportunities.",
      },
      status: "confirmed-in-code",
      publishByName: false,
      reviewNote: {
        es: "Confirmar si las consultas de usuarios se consideran datos personales en el uso productivo.",
        en: "Confirm whether user queries are treated as personal data in production use.",
      },
    },
    {
      id: "authjs",
      name: "Auth.js",
      purpose: {
        es: "Autenticación por credenciales y sesiones JWT mediante cookies esenciales.",
        en: "Credential authentication and JWT sessions through essential cookies.",
      },
      status: "confirmed-in-code",
      publishByName: false,
      reviewNote: {
        es: "Es una dependencia de la aplicación; no se detectó un proveedor externo de identidad configurado.",
        en: "This is an application dependency; no external identity provider was found configured.",
      },
    },
    {
      id: "linkedin-lead-sync",
      name: "LinkedIn Lead Sync API",
      purpose: {
        es: "Sincronización prevista de respuestas autorizadas de LinkedIn Lead Gen Forms.",
        en: "Planned synchronization of authorized LinkedIn Lead Gen Forms responses.",
      },
      status: "planned-not-implemented",
      publishByName: true,
      reviewNote: {
        es: "La implementación OAuth, los tokens, webhooks y tablas de respuestas no existen todavía en este repositorio.",
        en: "The OAuth implementation, tokens, webhooks, and response tables do not yet exist in this repository.",
      },
    },
  ] satisfies DetectedProvider[],
  retentionPeriods: {
    accountInformation: pendingRetention,
    activeLeads: pendingRetention,
    closedLeads: pendingRetention,
    linkedinResponses: pendingRetention,
    oauthTokens: pendingRetention,
    auditLogs: pendingRetention,
    technicalLogs: pendingRetention,
    privacyRequests: pendingRetention,
    backups: pendingRetention,
  } satisfies Record<RetentionCategory, ConfigurableLegalValue>,
} as const;

export function localizedLegalValue(
  field: ConfigurableLegalValue,
  locale: LegalLocale,
): { value: string; pending: boolean; reviewLabel: string } {
  return {
    value: field.placeholder[locale],
    pending: field.value === null,
    reviewLabel: field.reviewLabel[locale],
  };
}

export function privacyPolicyPath(locale: LegalLocale): string {
  return locale === "es"
    ? legalConfig.privacyPolicyUrlEs
    : legalConfig.privacyPolicyUrlEn;
}

export function dataDeletionHref(locale: LegalLocale): string {
  if (legalConfig.dataDeletionUrl) return legalConfig.dataDeletionUrl;

  const email = legalConfig.contactEmail.value ?? "";
  const subject =
    locale === "es"
      ? "Solicitud de eliminación de datos"
      : "Request for data deletion";

  return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}

export function legalConfigurationIssues(): string[] {
  const fields: Array<[string, ConfigurableLegalValue]> = [
    ["legalEntityName", legalConfig.legalEntityName],
    ["legalAddress", legalConfig.legalAddress],
    ["contactEmail", legalConfig.contactEmail],
    ["effectiveDate", legalConfig.effectiveDate],
    ["lastUpdatedDate", legalConfig.lastUpdatedDate],
  ];

  const issues = fields
    .filter(([, field]) => field.value === null)
    .map(([name]) => name);

  if (!legalConfig.publicSiteUrl) issues.push("publicSiteUrl");
  if (!legalConfig.dataDeletionUrl && !legalConfig.contactEmail.value) {
    issues.push("dataDeletionUrl");
  }

  for (const [category, period] of Object.entries(legalConfig.retentionPeriods)) {
    if (period.value === null) issues.push(`retentionPeriods.${category}`);
  }

  return issues;
}
