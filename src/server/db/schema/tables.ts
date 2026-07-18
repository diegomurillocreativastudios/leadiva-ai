import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firstName: varchar("first_name", { length: 120 }).notNull(),
    lastName: varchar("last_name", { length: 120 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    imageUrl: text("image_url"),
    role: varchar("role", { length: 40 }).notNull().default("USER"),
    interestCategories: jsonb("interest_categories")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("users_email_uidx").on(table.email)],
);

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 250 }).notNull(),
    slug: varchar("slug", { length: 280 }).notNull(),
    organizationType: varchar("organization_type", { length: 60 })
      .notNull()
      .default("OTHER"),
    sector: varchar("sector", { length: 120 }),
    countryCode: varchar("country_code", { length: 2 }).notNull().default("SV"),
    websiteUrl: text("website_url"),
    linkedinUrl: text("linkedin_url"),
    isVerified: boolean("is_verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("organizations_slug_uidx").on(table.slug)],
);

export const searchProfiles = pgTable("search_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  sourceType: varchar("source_type", { length: 40 }).notNull(),
  keywords: jsonb("keywords").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  excludedKeywords: jsonb("excluded_keywords")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  countries: jsonb("countries").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  sectors: jsonb("sectors").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  targetDomains: jsonb("target_domains")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  isActive: boolean("is_active").notNull().default(true),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const searchExecutions = pgTable("search_executions", {
  id: uuid("id").defaultRandom().primaryKey(),
  searchProfileId: uuid("search_profile_id").references(() => searchProfiles.id, {
    onDelete: "set null",
  }),
  status: varchar("status", { length: 40 }).notNull().default("PENDING"),
  queriesExecuted: integer("queries_executed").notNull().default(0),
  candidatesFound: integer("candidates_found").notNull().default(0),
  candidatesDiscarded: integer("candidates_discarded").notNull().default(0),
  opportunitiesCreated: integer("opportunities_created").notNull().default(0),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  estimatedCost: numeric("estimated_cost", { precision: 12, scale: 6 })
    .notNull()
    .default("0"),
  metrics: jsonb("metrics").$type<Record<string, unknown>>(),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const searchResults = pgTable(
  "search_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    searchExecutionId: uuid("search_execution_id").references(
      () => searchExecutions.id,
      { onDelete: "set null" },
    ),
    sourceType: varchar("source_type", { length: 40 }).notNull(),
    externalId: varchar("external_id", { length: 120 }),
    title: varchar("title", { length: 500 }).notNull(),
    snippet: text("snippet"),
    sourceUrl: text("source_url").notNull(),
    sourceOriginalUrl: text("source_original_url"),
    sourceResolvedUrl: text("source_resolved_url"),
    normalizedUrl: varchar("normalized_url", { length: 1000 }).notNull(),
    sourceTitle: varchar("source_title", { length: 500 }),
    sourceDomain: varchar("source_domain", { length: 255 }),
    organizationName: varchar("organization_name", { length: 250 }),
    category: varchar("category", { length: 40 }),
    countryCode: varchar("country_code", { length: 2 }),
    adminArea: varchar("admin_area", { length: 120 }),
    city: varchar("city", { length: 120 }),
    workMode: varchar("work_mode", { length: 20 }).notNull().default("UNKNOWN"),
    contractingSector: varchar("contracting_sector", { length: 20 })
      .notNull()
      .default("UNKNOWN"),
    estimatedAmount: numeric("estimated_amount", { precision: 14, scale: 2 }),
    currency: varchar("currency", { length: 3 }),
    amountStatus: varchar("amount_status", { length: 40 })
      .notNull()
      .default("UNKNOWN"),
    amountEvidenceText: varchar("amount_evidence_text", { length: 1000 }),
    amountEvidenceUrl: text("amount_evidence_url"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    preliminaryScore: integer("preliminary_score"),
    verificationStatus: varchar("verification_status", { length: 40 })
      .notNull()
      .default("PENDING"),
    verificationReason: text("verification_reason"),
    titleConfirmed: boolean("title_confirmed").notNull().default(false),
    buyerConfirmed: boolean("buyer_confirmed").notNull().default(false),
    amountConfirmed: boolean("amount_confirmed").notNull().default(false),
    deadlineConfirmed: boolean("deadline_confirmed").notNull().default(false),
    sourceIsSpecific: boolean("source_is_specific").notNull().default(false),
    sourceIsGrounded: boolean("source_is_grounded").notNull().default(false),
    fieldEvidence: jsonb("field_evidence").$type<
      Array<{ field: string; text: string; url: string; confirmed: boolean }>
    >(),
    discardReason: text("discard_reason"),
    contentHash: varchar("content_hash", { length: 64 }),
    rawData: jsonb("raw_data").$type<Record<string, unknown>>(),
    discoveredAt: timestamp("discovered_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("search_results_normalized_url_uidx")
      .on(table.normalizedUrl)
      .where(sql`${table.deletedAt} is null`),
    uniqueIndex("search_results_source_external_uidx")
      .on(table.sourceType, table.externalId)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    originSearchResultId: uuid("origin_search_result_id").references(
      () => searchResults.id,
      { onDelete: "set null" },
    ),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    opportunityType: varchar("opportunity_type", { length: 40 })
      .notNull()
      .default("OTHER"),
    primarySourceType: varchar("primary_source_type", { length: 40 }).notNull(),
    category: varchar("category", { length: 40 }),
    status: varchar("status", { length: 40 }).notNull().default("DETECTED"),
    verificationStatus: varchar("verification_status", { length: 40 })
      .notNull()
      .default("PENDING"),
    relevanceScore: integer("relevance_score"),
    relevanceExplanation: text("relevance_explanation"),
    countryCode: varchar("country_code", { length: 2 }),
    adminArea: varchar("admin_area", { length: 120 }),
    city: varchar("city", { length: 120 }),
    workMode: varchar("work_mode", { length: 20 }).notNull().default("UNKNOWN"),
    estimatedAmount: numeric("estimated_amount", { precision: 14, scale: 2 }),
    currency: varchar("currency", { length: 3 }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    nextAction: text("next_action"),
    nextActionAt: timestamp("next_action_at", { withTimezone: true }),
    discoveredAt: timestamp("discovered_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    assignedToUserId: uuid("assigned_to_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("opportunities_origin_search_result_uidx")
      .on(table.originSearchResultId)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export const opportunitySources = pgTable(
  "opportunity_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    sourceType: varchar("source_type", { length: 40 }).notNull(),
    externalId: varchar("external_id", { length: 120 }),
    title: varchar("title", { length: 500 }),
    url: text("url").notNull(),
    normalizedUrl: varchar("normalized_url", { length: 1000 }).notNull(),
    domain: varchar("domain", { length: 255 }),
    isOfficial: boolean("is_official").notNull().default(false),
    isPrimary: boolean("is_primary").notNull().default(false),
    contentHash: varchar("content_hash", { length: 64 }),
    discoveredAt: timestamp("discovered_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("opportunity_sources_opp_url_uidx").on(
      table.opportunityId,
      table.normalizedUrl,
    ),
  ],
);

export const opportunityDocuments = pgTable("opportunity_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  opportunityId: uuid("opportunity_id")
    .notNull()
    .references(() => opportunities.id, { onDelete: "cascade" }),
  opportunitySourceId: uuid("opportunity_source_id").references(
    () => opportunitySources.id,
    { onDelete: "set null" },
  ),
  name: varchar("name", { length: 255 }).notNull(),
  originalUrl: text("original_url"),
  storageObjectName: text("storage_object_name"),
  mimeType: varchar("mime_type", { length: 120 }),
  sizeBytes: integer("size_bytes"),
  contentHash: varchar("content_hash", { length: 64 }),
  textExtractionStatus: varchar("text_extraction_status", { length: 40 })
    .notNull()
    .default("NOT_REQUIRED"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const opportunityNotes = pgTable("opportunity_notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  opportunityId: uuid("opportunity_id")
    .notNull()
    .references(() => opportunities.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const opportunityStatusHistory = pgTable("opportunity_status_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  opportunityId: uuid("opportunity_id")
    .notNull()
    .references(() => opportunities.id, { onDelete: "cascade" }),
  previousStatus: varchar("previous_status", { length: 40 }),
  newStatus: varchar("new_status", { length: 40 }).notNull(),
  reason: text("reason"),
  changedByUserId: uuid("changed_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  changedAt: timestamp("changed_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
