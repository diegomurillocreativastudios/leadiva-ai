import "server-only";

import type { LegalLocale } from "@/config/legal";

import { privacyPolicyEn } from "./privacy-policy.en";
import { privacyPolicyEs } from "./privacy-policy.es";
import type { PrivacyPolicyDocument } from "./types";

const documents: Record<LegalLocale, PrivacyPolicyDocument> = {
  es: privacyPolicyEs,
  en: privacyPolicyEn,
};

export function getPrivacyPolicy(
  locale: LegalLocale,
): PrivacyPolicyDocument {
  return documents[locale];
}

export type {
  PrivacyContentBlock,
  PrivacyPolicyDocument,
  PrivacySection,
  RetentionRowCopy,
} from "./types";
