export const userRoles = [
  "ADMIN",
  "COMMERCIAL_ANALYST",
  "TECHNICAL_REVIEWER",
  "MANAGEMENT",
  "VIEWER",
] as const;

export type UserRole = (typeof userRoles)[number];

export const interestCategories = [
  "SOFTWARE",
  "IT",
  "CONSULTING",
  "AI",
] as const;

export type InterestCategory = (typeof interestCategories)[number];

export const organizationTypes = [
  "PUBLIC_INSTITUTION",
  "PRIVATE_COMPANY",
  "NGO",
  "INTERNATIONAL_ORGANIZATION",
  "OTHER",
] as const;

export type OrganizationType = (typeof organizationTypes)[number];

export const sourceTypes = [
  "COMPRASAL",
  "PRIVATE_WEB",
  "LINKEDIN",
  "MANUAL",
] as const;

export type SourceType = (typeof sourceTypes)[number];

export const searchExecutionStatuses = [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "PARTIALLY_COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export type SearchExecutionStatus = (typeof searchExecutionStatuses)[number];

export const verificationStatuses = [
  "PENDING",
  "PARTIALLY_VERIFIED",
  "VERIFIED",
  "REJECTED",
] as const;

export type VerificationStatus = (typeof verificationStatuses)[number];

export const workModes = [
  "ONSITE",
  "REMOTE",
  "HYBRID",
  "UNKNOWN",
] as const;

export type WorkMode = (typeof workModes)[number];

export const contractingSectors = [
  "PUBLIC",
  "PRIVATE",
  "UNKNOWN",
] as const;

export type ContractingSector = (typeof contractingSectors)[number];

export const opportunityTypes = [
  "TENDER",
  "RFP",
  "CONSULTING",
  "PROJECT",
  "VENDOR_REGISTRATION",
  "REQUEST_FOR_QUOTATION",
  "OTHER",
] as const;

export type OpportunityType = (typeof opportunityTypes)[number];

export const opportunityStatuses = [
  "DETECTED",
  "UNDER_REVIEW",
  "APPROVED",
  "PREPARING_PROPOSAL",
  "PROPOSAL_SENT",
  "WON",
  "LOST",
  "DISCARDED",
  "EXPIRED",
  "DUPLICATE",
] as const;

export type OpportunityStatus = (typeof opportunityStatuses)[number];

export const textExtractionStatuses = [
  "PENDING",
  "COMPLETED",
  "FAILED",
  "NOT_REQUIRED",
] as const;

export type TextExtractionStatus = (typeof textExtractionStatuses)[number];

export const projectCategories = [
  "SOFTWARE",
  "IT",
  "CONSULTING",
  "AI",
  "OTHER",
] as const;

export type ProjectCategory = (typeof projectCategories)[number];
