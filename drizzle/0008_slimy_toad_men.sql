DROP INDEX "search_results_normalized_url_uidx";--> statement-breakpoint
CREATE INDEX "search_results_normalized_url_idx" ON "search_results" USING btree ("normalized_url");--> statement-breakpoint
CREATE UNIQUE INDEX "search_results_comprasal_available_identity_uidx" ON "search_results" USING btree ("source_type","external_id") WHERE "search_results"."source_type" = 'COMPRASAL' and "search_results"."external_id" like 'available:%';--> statement-breakpoint
CREATE UNIQUE INDEX "search_results_normalized_url_uidx" ON "search_results" USING btree ("normalized_url") WHERE "search_results"."deleted_at" is null and "search_results"."source_type" <> 'COMPRASAL';

-- No search_results row is deleted or rewritten by this migration.
-- Manual rollback (after rolling back the application):
-- DROP INDEX IF EXISTS search_results_comprasal_available_identity_uidx;
-- DROP INDEX IF EXISTS search_results_normalized_url_idx;
-- DROP INDEX IF EXISTS search_results_normalized_url_uidx;
-- CREATE UNIQUE INDEX search_results_normalized_url_uidx
--   ON search_results USING btree (normalized_url)
--   WHERE deleted_at IS NULL;
