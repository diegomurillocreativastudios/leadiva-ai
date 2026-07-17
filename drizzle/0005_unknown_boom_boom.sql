DROP INDEX "opportunities_origin_search_result_uidx";--> statement-breakpoint
DROP INDEX "search_results_normalized_url_uidx";--> statement-breakpoint
DROP INDEX "search_results_source_external_uidx";--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "search_results" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "opportunities_origin_search_result_uidx" ON "opportunities" USING btree ("origin_search_result_id") WHERE "opportunities"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "search_results_normalized_url_uidx" ON "search_results" USING btree ("normalized_url") WHERE "search_results"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "search_results_source_external_uidx" ON "search_results" USING btree ("source_type","external_id") WHERE "search_results"."deleted_at" is null;