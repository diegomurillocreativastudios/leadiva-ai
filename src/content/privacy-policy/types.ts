import type { LegalLocale, RetentionCategory } from "@/config/legal";

export type PrivacyContentBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "subsection"; title: string; paragraphs?: string[]; items?: string[] }
  | { type: "note"; title: string; text: string; tone: "info" | "warning" }
  | { type: "externalLink"; label: string; href: string; description: string };

export type PrivacySection = {
  id: string;
  title: string;
  blocks: PrivacyContentBlock[];
  showRetentionTable?: boolean;
  showContactCard?: boolean;
};

export type RetentionRowCopy = {
  category: string;
  justification: string;
  finalAction: string;
};

export type PrivacyPolicyDocument = {
  locale: LegalLocale;
  htmlLang: string;
  alternateLocale: LegalLocale;
  alternatePath: string;
  metadata: {
    title: string;
    description: string;
    openGraphLocale: string;
    alternateOpenGraphLocale: string;
  };
  chrome: {
    languageSelectAriaLabel: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    introduction: string;
  };
  toc: {
    title: string;
    ariaLabel: string;
  };
  sections: PrivacySection[];
  retention: {
    caption: string;
    headers: {
      category: string;
      period: string;
      justification: string;
      finalAction: string;
    };
    rows: Record<RetentionCategory, RetentionRowCopy>;
    footnote: string;
  };
  contact: {
    title: string;
    pendingLabel: string;
    labels: {
      legalEntity: string;
      tradeName: string;
      country: string;
      address: string;
      email: string;
    };
  };
  backToTop: string;
};
