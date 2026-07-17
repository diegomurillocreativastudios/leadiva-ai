ALTER TABLE "search_results" ADD COLUMN "contracting_sector" varchar(20) DEFAULT 'UNKNOWN' NOT NULL;--> statement-breakpoint
ALTER TABLE "search_results" ADD COLUMN "estimated_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "search_results" ADD COLUMN "currency" varchar(3);