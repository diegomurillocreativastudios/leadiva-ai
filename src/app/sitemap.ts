import type { MetadataRoute } from "next";

import { legalConfig } from "@/config/legal";
import { resolvePublicOrigin } from "@/features/legal/public-origin";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await resolvePublicOrigin();
  if (!origin) return [];

  const spanishUrl = new URL(
    legalConfig.privacyPolicyUrlEs,
    origin,
  ).toString();
  const englishUrl = new URL(
    legalConfig.privacyPolicyUrlEn,
    origin,
  ).toString();
  const languages = {
    "es-SV": spanishUrl,
    en: englishUrl,
  };

  return [
    {
      url: spanishUrl,
      changeFrequency: "yearly",
      priority: 0.3,
      alternates: { languages },
    },
    {
      url: englishUrl,
      changeFrequency: "yearly",
      priority: 0.3,
      alternates: { languages },
    },
  ];
}
