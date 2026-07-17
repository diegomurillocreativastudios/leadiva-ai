import "server-only";

import { z } from "zod";

import {
  isEmailDomainAllowed,
  parseAllowedEmailDomains,
} from "@/lib/email-domains";

function resolveDatabaseUrl(): string {
  const url =
    process.env.DATABASE_URL?.trim() ||
    process.env.NEON_DB_URL?.trim() ||
    "";

  if (!url) {
    throw new Error(
      "Missing DATABASE_URL or NEON_DB_URL. Add one to .env.local.",
    );
  }

  return url;
}

const serverEnvSchema = z.object({
  APP_NAME: z.string().default("Leadiva"),
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_DIRECT: z.string().min(1).optional(),
  AUTH_SECRET: z.string().min(32),
  ALLOWED_EMAIL_DOMAINS: z.string().optional(),
  COMPRASAL_BASE_URL: z
    .string()
    .url()
    .default("https://www.comprasal.gob.sv/api/v1"),
  COMPRASAL_SYNC_MAX_PAGES: z.coerce.number().int().min(1).max(20).default(3),
  COMPRASAL_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(5_000)
    .max(120_000)
    .default(45_000),
  COMPRASAL_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  JOB_SYNC_SECRET: z.string().min(16).optional(),
  GCP_PROJECT_ID: z.string().optional(),
  GCP_LOCATION: z.string().default("us-central1"),
  VERTEX_MODEL: z.string().default("gemini-2.5-flash-lite"),
  /** Discovery defaults to Flash-Lite to stay within free/low quotas. */
  VERTEX_GROUNDING_MODEL: z.string().default("gemini-2.5-flash-lite"),
  VERTEX_GROUNDING_LOCATION: z.string().default("global"),
  SEARCH_MAX_QUERIES: z.coerce.number().int().min(1).max(50).default(8),
  /** Keep low: each pass is a billable generateContent + Search call. */
  SEARCH_GROUNDING_PASSES: z.coerce.number().int().min(1).max(12).default(4),
  SEARCH_GROUNDING_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(2),
  SEARCH_GROUNDING_MAX_OUTPUT_TOKENS: z.coerce
    .number()
    .int()
    .min(512)
    .max(8192)
    .default(4096),
  SEARCH_NORMALIZATION_MAX_OUTPUT_TOKENS: z.coerce
    .number()
    .int()
    .min(512)
    .max(8192)
    .default(4096),
  SEARCH_TARGET_UNIQUE_CANDIDATES: z.coerce.number().int().min(1).max(50).default(10),
  SEARCH_MAX_CONSECUTIVE_EMPTY_PASSES: z.coerce
    .number()
    .int()
    .min(1)
    .max(5)
    .default(2),
  SEARCH_MAX_INPUT_TOKENS: z.coerce.number().int().min(1_000).max(100_000).default(24_000),
  SEARCH_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1_000).max(100_000).default(16_000),
  SEARCH_MAX_ESTIMATED_COST: z.coerce.number().min(0.0001).max(10).default(0.02),
  SEARCH_REGIONAL_SHARE: z.coerce.number().min(0).max(0.5).default(0.25),
  SEARCH_MAX_CANDIDATES: z.coerce.number().int().min(1).max(200).default(25),
  PRIVATE_WEB_DISCOVERY_MODE: z
    .enum(["GROUNDING_ONLY", "PROVIDER_SEARCH"])
    .default("GROUNDING_ONLY"),
  BRAVE_SEARCH_API_KEY: z.string().trim().min(1).optional(),
  BRAVE_SEARCH_COST_PER_REQUEST: z.coerce.number().min(0).max(1).default(0.005),
  PRIVATE_WEB_MAX_PROVIDER_QUERIES: z.coerce.number().int().min(1).max(50).default(8),
  PRIVATE_WEB_RESULTS_PER_QUERY: z.coerce.number().int().min(1).max(20).default(10),
  PRIVATE_WEB_MAX_PAGES_PER_QUERY: z.coerce.number().int().min(1).max(10).default(1),
  PRIVATE_WEB_MAX_PROVIDER_RESULTS: z.coerce.number().int().min(1).max(500).default(80),
  PRIVATE_WEB_MAX_UNIQUE_URLS: z.coerce.number().int().min(1).max(250).default(40),
  PRIVATE_WEB_MAX_URLS_PER_DOMAIN: z.coerce.number().int().min(1).max(20).default(3),
  PRIVATE_WEB_SEARCH_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),
  PRIVATE_WEB_SEARCH_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(10_000),
  PRIVATE_WEB_SEARCH_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  PRIVATE_WEB_MAX_CONSECUTIVE_EMPTY_QUERIES: z.coerce.number().int().min(1).max(10).default(2),
  PRIVATE_WEB_MAX_FETCH_DOCUMENTS: z.coerce.number().int().min(1).max(100).default(15),
  PRIVATE_WEB_FETCH_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(3),
  PRIVATE_WEB_FETCH_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(12_000),
  PRIVATE_WEB_MAX_DOCUMENT_BYTES: z.coerce.number().int().min(10_000).max(25_000_000).default(5_000_000),
  PRIVATE_WEB_MAX_REDIRECTS: z.coerce.number().int().min(0).max(10).default(4),
  PRIVATE_WEB_MAX_REQUESTS_PER_HOST: z.coerce.number().int().min(1).max(10).default(2),
  PRIVATE_WEB_FETCH_USER_AGENT: z.string().trim().min(3).max(250).default("CreativaLeadsBot/1.0"),
  PRIVATE_WEB_ROBOTS_CACHE_TTL_MS: z.coerce.number().int().min(60_000).max(86_400_000).default(3_600_000),
  PRIVATE_WEB_MAX_PDF_PAGES: z.coerce.number().int().min(1).max(100).default(30),
  PRIVATE_WEB_MAX_EXTRACTION_DOCUMENTS: z.coerce.number().int().min(1).max(100).default(12),
  PRIVATE_WEB_EXTRACTION_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),
  PRIVATE_WEB_MAX_EXTRACTION_TOKENS: z.coerce.number().int().min(512).max(16_384).default(6_000),
  PRIVATE_WEB_MAX_GROUNDING_VERIFICATIONS: z.coerce.number().int().min(0).max(20).default(3),
  PRIVATE_WEB_TARGET_CANDIDATES: z.coerce.number().int().min(1).max(100).default(8),
  PRIVATE_WEB_MAX_ESTIMATED_COST: z.coerce.number().min(0.001).max(10).default(0.10),
});

export type ServerEnv = z.infer<typeof serverEnvSchema> & {
  allowedEmailDomains: string[];
};

let cachedEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const databaseUrl = resolveDatabaseUrl();
  const parsed = serverEnvSchema.safeParse({
    APP_NAME: process.env.APP_NAME,
    DATABASE_URL: databaseUrl,
    DATABASE_URL_DIRECT:
      process.env.DATABASE_URL_DIRECT?.trim() || databaseUrl,
    AUTH_SECRET: process.env.AUTH_SECRET,
    ALLOWED_EMAIL_DOMAINS: process.env.ALLOWED_EMAIL_DOMAINS,
    COMPRASAL_BASE_URL: process.env.COMPRASAL_BASE_URL,
    COMPRASAL_SYNC_MAX_PAGES: process.env.COMPRASAL_SYNC_MAX_PAGES,
    COMPRASAL_REQUEST_TIMEOUT_MS: process.env.COMPRASAL_REQUEST_TIMEOUT_MS,
    COMPRASAL_MAX_RETRIES: process.env.COMPRASAL_MAX_RETRIES,
    JOB_SYNC_SECRET: process.env.JOB_SYNC_SECRET,
    GCP_PROJECT_ID: process.env.GCP_PROJECT_ID,
    GCP_LOCATION: process.env.GCP_LOCATION,
    VERTEX_MODEL: process.env.VERTEX_MODEL,
    VERTEX_GROUNDING_MODEL: process.env.VERTEX_GROUNDING_MODEL,
    VERTEX_GROUNDING_LOCATION: process.env.VERTEX_GROUNDING_LOCATION,
    SEARCH_MAX_QUERIES: process.env.SEARCH_MAX_QUERIES,
    SEARCH_GROUNDING_PASSES: process.env.SEARCH_GROUNDING_PASSES,
    SEARCH_GROUNDING_CONCURRENCY: process.env.SEARCH_GROUNDING_CONCURRENCY,
    SEARCH_GROUNDING_MAX_OUTPUT_TOKENS:
      process.env.SEARCH_GROUNDING_MAX_OUTPUT_TOKENS,
    SEARCH_NORMALIZATION_MAX_OUTPUT_TOKENS:
      process.env.SEARCH_NORMALIZATION_MAX_OUTPUT_TOKENS,
    SEARCH_TARGET_UNIQUE_CANDIDATES: process.env.SEARCH_TARGET_UNIQUE_CANDIDATES,
    SEARCH_MAX_CONSECUTIVE_EMPTY_PASSES:
      process.env.SEARCH_MAX_CONSECUTIVE_EMPTY_PASSES,
    SEARCH_MAX_INPUT_TOKENS: process.env.SEARCH_MAX_INPUT_TOKENS,
    SEARCH_MAX_OUTPUT_TOKENS: process.env.SEARCH_MAX_OUTPUT_TOKENS,
    SEARCH_MAX_ESTIMATED_COST: process.env.SEARCH_MAX_ESTIMATED_COST,
    SEARCH_REGIONAL_SHARE: process.env.SEARCH_REGIONAL_SHARE,
    SEARCH_MAX_CANDIDATES: process.env.SEARCH_MAX_CANDIDATES,
    PRIVATE_WEB_DISCOVERY_MODE: process.env.PRIVATE_WEB_DISCOVERY_MODE,
    BRAVE_SEARCH_API_KEY: process.env.BRAVE_SEARCH_API_KEY?.trim() || undefined,
    BRAVE_SEARCH_COST_PER_REQUEST: process.env.BRAVE_SEARCH_COST_PER_REQUEST,
    PRIVATE_WEB_MAX_PROVIDER_QUERIES: process.env.PRIVATE_WEB_MAX_PROVIDER_QUERIES,
    PRIVATE_WEB_RESULTS_PER_QUERY: process.env.PRIVATE_WEB_RESULTS_PER_QUERY,
    PRIVATE_WEB_MAX_PAGES_PER_QUERY: process.env.PRIVATE_WEB_MAX_PAGES_PER_QUERY,
    PRIVATE_WEB_MAX_PROVIDER_RESULTS: process.env.PRIVATE_WEB_MAX_PROVIDER_RESULTS,
    PRIVATE_WEB_MAX_UNIQUE_URLS: process.env.PRIVATE_WEB_MAX_UNIQUE_URLS,
    PRIVATE_WEB_MAX_URLS_PER_DOMAIN: process.env.PRIVATE_WEB_MAX_URLS_PER_DOMAIN,
    PRIVATE_WEB_SEARCH_CONCURRENCY: process.env.PRIVATE_WEB_SEARCH_CONCURRENCY,
    PRIVATE_WEB_SEARCH_TIMEOUT_MS: process.env.PRIVATE_WEB_SEARCH_TIMEOUT_MS,
    PRIVATE_WEB_SEARCH_MAX_RETRIES: process.env.PRIVATE_WEB_SEARCH_MAX_RETRIES,
    PRIVATE_WEB_MAX_CONSECUTIVE_EMPTY_QUERIES:
      process.env.PRIVATE_WEB_MAX_CONSECUTIVE_EMPTY_QUERIES,
    PRIVATE_WEB_MAX_FETCH_DOCUMENTS: process.env.PRIVATE_WEB_MAX_FETCH_DOCUMENTS,
    PRIVATE_WEB_FETCH_CONCURRENCY: process.env.PRIVATE_WEB_FETCH_CONCURRENCY,
    PRIVATE_WEB_FETCH_TIMEOUT_MS: process.env.PRIVATE_WEB_FETCH_TIMEOUT_MS,
    PRIVATE_WEB_MAX_DOCUMENT_BYTES: process.env.PRIVATE_WEB_MAX_DOCUMENT_BYTES,
    PRIVATE_WEB_MAX_REDIRECTS: process.env.PRIVATE_WEB_MAX_REDIRECTS,
    PRIVATE_WEB_MAX_REQUESTS_PER_HOST: process.env.PRIVATE_WEB_MAX_REQUESTS_PER_HOST,
    PRIVATE_WEB_FETCH_USER_AGENT: process.env.PRIVATE_WEB_FETCH_USER_AGENT,
    PRIVATE_WEB_ROBOTS_CACHE_TTL_MS: process.env.PRIVATE_WEB_ROBOTS_CACHE_TTL_MS,
    PRIVATE_WEB_MAX_PDF_PAGES: process.env.PRIVATE_WEB_MAX_PDF_PAGES,
    PRIVATE_WEB_MAX_EXTRACTION_DOCUMENTS: process.env.PRIVATE_WEB_MAX_EXTRACTION_DOCUMENTS,
    PRIVATE_WEB_EXTRACTION_CONCURRENCY: process.env.PRIVATE_WEB_EXTRACTION_CONCURRENCY,
    PRIVATE_WEB_MAX_EXTRACTION_TOKENS: process.env.PRIVATE_WEB_MAX_EXTRACTION_TOKENS,
    PRIVATE_WEB_MAX_GROUNDING_VERIFICATIONS: process.env.PRIVATE_WEB_MAX_GROUNDING_VERIFICATIONS,
    PRIVATE_WEB_TARGET_CANDIDATES: process.env.PRIVATE_WEB_TARGET_CANDIDATES,
    PRIVATE_WEB_MAX_ESTIMATED_COST: process.env.PRIVATE_WEB_MAX_ESTIMATED_COST,
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid server environment: ${details}`);
  }

  const allowedEmailDomains = parseAllowedEmailDomains(
    parsed.data.ALLOWED_EMAIL_DOMAINS,
  );

  cachedEnv = {
    ...parsed.data,
    allowedEmailDomains,
  };

  return cachedEnv;
}

export function isAllowedEmailDomain(email: string): boolean {
  return isEmailDomainAllowed(email, getServerEnv().allowedEmailDomains);
}
