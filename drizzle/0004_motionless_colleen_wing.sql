ALTER TABLE "search_results" ADD COLUMN "source_original_url" text;--> statement-breakpoint
ALTER TABLE "search_results" ADD COLUMN "source_resolved_url" text;--> statement-breakpoint
ALTER TABLE "search_results" ADD COLUMN "source_title" varchar(500);--> statement-breakpoint
ALTER TABLE "search_results" ADD COLUMN "source_domain" varchar(255);--> statement-breakpoint
ALTER TABLE "search_results" ADD COLUMN "amount_status" varchar(40) DEFAULT 'UNKNOWN' NOT NULL;--> statement-breakpoint
ALTER TABLE "search_results" ADD COLUMN "amount_evidence_text" varchar(1000);--> statement-breakpoint
ALTER TABLE "search_results" ADD COLUMN "amount_evidence_url" text;--> statement-breakpoint
ALTER TABLE "search_results" ADD COLUMN "verification_reason" text;--> statement-breakpoint
ALTER TABLE "search_results" ADD COLUMN "title_confirmed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "search_results" ADD COLUMN "buyer_confirmed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "search_results" ADD COLUMN "amount_confirmed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "search_results" ADD COLUMN "deadline_confirmed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "search_results" ADD COLUMN "source_is_specific" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "search_results" ADD COLUMN "source_is_grounded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "search_results" ADD COLUMN "field_evidence" jsonb;