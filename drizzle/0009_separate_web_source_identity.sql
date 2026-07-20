DROP INDEX "search_results_normalized_url_uidx";--> statement-breakpoint
CREATE UNIQUE INDEX "search_results_normalized_url_uidx" ON "search_results" USING btree ("source_type","normalized_url") WHERE "search_results"."deleted_at" is null and "search_results"."source_type" <> 'COMPRASAL';

-- This migration is intentionally not applied by the PRIVATE_WEB implementation.
-- It is required before enabling PRIVATE_WEB so equal URLs from LINKEDIN and
-- PRIVATE_WEB remain distinct canonical rows in both insertion orders.
