import type { FetchedDocument } from "@/server/services/web-document-fetcher";

export const PRIVATE_WEB_EVIDENCE_FIELDS = [
  "TITLE",
  "BUYER",
  "SCOPE",
  "EXTERNAL_INTENT",
  "PRIVATE_SECTOR",
  "COUNTRY",
  "TEMPORAL",
  "QUERY_RELATION",
  "AMOUNT",
  "APPLICATION",
] as const;

export type PrivateWebEvidenceField =
  (typeof PRIVATE_WEB_EVIDENCE_FIELDS)[number];

export type PrivateWebEvidence = {
  field: PrivateWebEvidenceField;
  text: string;
  url: string;
  confirmed: boolean;
};

export type CountryEvidenceSignal = {
  kind: string;
  strength: "STRONG" | "WEAK";
  evidence: string;
  sourceUrl: string;
};

export type CountryEvidence = {
  countryCode: "SV" | null;
  decision: "CONFIRMED" | "SUPPORTED" | "AMBIGUOUS" | "CONTRADICTED";
  confidence: number;
  signals: CountryEvidenceSignal[];
};

export type PrivateOrganizationType =
  | "PRIVATE_COMPANY"
  | "NGO"
  | "FOUNDATION"
  | "ASSOCIATION"
  | "PRIVATE_UNIVERSITY"
  | "BUSINESS_CHAMBER"
  | "OTHER_PRIVATE";

export type PrivateOpportunityKind =
  | "RFP"
  | "RFQ"
  | "TERMS_OF_REFERENCE"
  | "TENDER"
  | "VENDOR_REQUEST"
  | "CONSULTING"
  | "LICENSES"
  | "OTHER";

export type PrivateWebCandidate = {
  title: string;
  description: string | null;
  organizationName: string;
  organizationType: PrivateOrganizationType;
  category: "SOFTWARE" | "IT" | "CONSULTING" | "AI" | "OTHER";
  workMode: "ONSITE" | "REMOTE" | "HYBRID" | "UNKNOWN";
  opportunityKind: PrivateOpportunityKind;
  publishedAt: string | null;
  deadlineAt: string | null;
  estimatedAmount: string | null;
  currency: string | null;
  amountStatus: "PUBLISHED" | "RANGE_PUBLISHED" | "NOT_PUBLISHED" | "UNKNOWN";
  applicationInstructions: string | null;
  sourceUrl: string;
  sourceDomain: string;
  evidence: PrivateWebEvidence[];
  extractionMethod: "DETERMINISTIC" | "GEMINI";
};

export type VerifiedPrivateWebCandidate = PrivateWebCandidate & {
  countryCode: "SV";
  countryEvidence: CountryEvidence;
  contractingSector: "PRIVATE";
  preliminaryScore: number;
  verificationStatus: "VERIFIED" | "PARTIALLY_VERIFIED";
  verificationReason: string;
  document: FetchedDocument;
  normalizedUrl: string;
  contentHash: string;
};

export type PrivateWebCandidateRejection = {
  status: "REJECTED";
  reasonCode: string;
  reason: string;
  countryEvidence?: CountryEvidence;
};

