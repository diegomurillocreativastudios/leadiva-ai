CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"origin_search_result_id" uuid,
	"title" varchar(500) NOT NULL,
	"description" text,
	"opportunity_type" varchar(40) DEFAULT 'OTHER' NOT NULL,
	"primary_source_type" varchar(40) NOT NULL,
	"category" varchar(40),
	"status" varchar(40) DEFAULT 'DETECTED' NOT NULL,
	"verification_status" varchar(40) DEFAULT 'PENDING' NOT NULL,
	"relevance_score" integer,
	"relevance_explanation" text,
	"country_code" varchar(2),
	"admin_area" varchar(120),
	"city" varchar(120),
	"work_mode" varchar(20) DEFAULT 'UNKNOWN' NOT NULL,
	"estimated_amount" numeric(14, 2),
	"currency" varchar(3),
	"published_at" timestamp with time zone,
	"deadline_at" timestamp with time zone,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_verified_at" timestamp with time zone,
	"assigned_to_user_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"opportunity_source_id" uuid,
	"name" varchar(255) NOT NULL,
	"original_url" text,
	"storage_object_name" text,
	"mime_type" varchar(120),
	"size_bytes" integer,
	"content_hash" varchar(64),
	"text_extraction_status" varchar(40) DEFAULT 'NOT_REQUIRED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"source_type" varchar(40) NOT NULL,
	"external_id" varchar(120),
	"title" varchar(500),
	"url" text NOT NULL,
	"normalized_url" varchar(1000) NOT NULL,
	"domain" varchar(255),
	"is_official" boolean DEFAULT false NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"content_hash" varchar(64),
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"previous_status" varchar(40),
	"new_status" varchar(40) NOT NULL,
	"reason" text,
	"changed_by_user_id" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(250) NOT NULL,
	"slug" varchar(280) NOT NULL,
	"organization_type" varchar(60) DEFAULT 'OTHER' NOT NULL,
	"sector" varchar(120),
	"country_code" varchar(2) DEFAULT 'SV' NOT NULL,
	"website_url" text,
	"linkedin_url" text,
	"is_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"search_profile_id" uuid,
	"status" varchar(40) DEFAULT 'PENDING' NOT NULL,
	"queries_executed" integer DEFAULT 0 NOT NULL,
	"candidates_found" integer DEFAULT 0 NOT NULL,
	"candidates_discarded" integer DEFAULT 0 NOT NULL,
	"opportunities_created" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost" numeric(12, 6) DEFAULT '0' NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"source_type" varchar(40) NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"excluded_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"countries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sectors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"target_domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"search_execution_id" uuid,
	"source_type" varchar(40) NOT NULL,
	"external_id" varchar(120),
	"title" varchar(500) NOT NULL,
	"snippet" text,
	"source_url" text NOT NULL,
	"normalized_url" varchar(1000) NOT NULL,
	"organization_name" varchar(250),
	"category" varchar(40),
	"country_code" varchar(2),
	"admin_area" varchar(120),
	"city" varchar(120),
	"work_mode" varchar(20) DEFAULT 'UNKNOWN' NOT NULL,
	"published_at" timestamp with time zone,
	"deadline_at" timestamp with time zone,
	"preliminary_score" integer,
	"verification_status" varchar(40) DEFAULT 'PENDING' NOT NULL,
	"discard_reason" text,
	"content_hash" varchar(64),
	"raw_data" jsonb,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" varchar(120) NOT NULL,
	"last_name" varchar(120) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"image_url" text,
	"role" varchar(40) DEFAULT 'COMMERCIAL_ANALYST' NOT NULL,
	"interest_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_origin_search_result_id_search_results_id_fk" FOREIGN KEY ("origin_search_result_id") REFERENCES "public"."search_results"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_documents" ADD CONSTRAINT "opportunity_documents_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_documents" ADD CONSTRAINT "opportunity_documents_opportunity_source_id_opportunity_sources_id_fk" FOREIGN KEY ("opportunity_source_id") REFERENCES "public"."opportunity_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_notes" ADD CONSTRAINT "opportunity_notes_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_notes" ADD CONSTRAINT "opportunity_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_sources" ADD CONSTRAINT "opportunity_sources_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_status_history" ADD CONSTRAINT "opportunity_status_history_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_status_history" ADD CONSTRAINT "opportunity_status_history_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_executions" ADD CONSTRAINT "search_executions_search_profile_id_search_profiles_id_fk" FOREIGN KEY ("search_profile_id") REFERENCES "public"."search_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_profiles" ADD CONSTRAINT "search_profiles_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_results" ADD CONSTRAINT "search_results_search_execution_id_search_executions_id_fk" FOREIGN KEY ("search_execution_id") REFERENCES "public"."search_executions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "opportunities_origin_search_result_uidx" ON "opportunities" USING btree ("origin_search_result_id");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_sources_opp_url_uidx" ON "opportunity_sources" USING btree ("opportunity_id","normalized_url");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_uidx" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "search_results_normalized_url_uidx" ON "search_results" USING btree ("normalized_url");--> statement-breakpoint
CREATE UNIQUE INDEX "search_results_source_external_uidx" ON "search_results" USING btree ("source_type","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uidx" ON "users" USING btree ("email");