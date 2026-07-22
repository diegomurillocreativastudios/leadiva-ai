import type { Metadata } from "next";

import {
  legalConfig,
  privacyPolicyPath,
  type LegalLocale,
} from "@/config/legal";
import { getPrivacyPolicy } from "@/content/privacy-policy";

import { resolvePublicOrigin } from "./public-origin";

function absolutePolicyUrl(locale: LegalLocale, origin: string): string {
  return new URL(privacyPolicyPath(locale), origin).toString();
}

export async function createPrivacyPolicyMetadata(
  locale: LegalLocale,
): Promise<Metadata> {
  const document = getPrivacyPolicy(locale);
  const origin = await resolvePublicOrigin();
  const canonical = origin ? absolutePolicyUrl(locale, origin) : null;
  const spanishUrl = origin ? absolutePolicyUrl("es", origin) : null;
  const englishUrl = origin ? absolutePolicyUrl("en", origin) : null;

  return {
    title: { absolute: document.metadata.title },
    description: document.metadata.description,
    alternates:
      canonical && spanishUrl && englishUrl
        ? {
            canonical,
            languages: {
              "es-SV": spanishUrl,
              en: englishUrl,
              "x-default": spanishUrl,
            },
          }
        : undefined,
    openGraph: {
      type: "website",
      title: document.metadata.title,
      description: document.metadata.description,
      siteName: legalConfig.productName,
      locale: document.metadata.openGraphLocale,
      alternateLocale: [document.metadata.alternateOpenGraphLocale],
      url: canonical ?? undefined,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}
