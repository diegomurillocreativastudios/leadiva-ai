CREATE TABLE "search_execution_results" (
	"search_execution_id" uuid NOT NULL,
	"search_result_id" uuid NOT NULL,
	"preliminary_score" integer,
	"rank" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_execution_results_rank_check" CHECK ("search_execution_results"."rank" > 0),
	CONSTRAINT "search_execution_results_score_check" CHECK ("search_execution_results"."preliminary_score" is null or ("search_execution_results"."preliminary_score" >= 0 and "search_execution_results"."preliminary_score" <= 100))
);
--> statement-breakpoint
CREATE TABLE "user_search_result_states" (
	"user_id" uuid NOT NULL,
	"search_result_id" uuid NOT NULL,
	"state" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"dismissed_at" timestamp with time zone,
	"dismiss_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_search_result_states_state_check" CHECK ("user_search_result_states"."state" in ('ACTIVE', 'DISMISSED'))
);
--> statement-breakpoint
ALTER TABLE "search_profiles" ADD COLUMN "profile_key" varchar(80);--> statement-breakpoint
ALTER TABLE "search_execution_results" ADD CONSTRAINT "search_execution_results_search_execution_id_search_executions_id_fk" FOREIGN KEY ("search_execution_id") REFERENCES "public"."search_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_execution_results" ADD CONSTRAINT "search_execution_results_search_result_id_search_results_id_fk" FOREIGN KEY ("search_result_id") REFERENCES "public"."search_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_search_result_states" ADD CONSTRAINT "user_search_result_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_search_result_states" ADD CONSTRAINT "user_search_result_states_search_result_id_search_results_id_fk" FOREIGN KEY ("search_result_id") REFERENCES "public"."search_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "search_execution_results_execution_result_uidx" ON "search_execution_results" USING btree ("search_execution_id","search_result_id");--> statement-breakpoint
CREATE INDEX "search_execution_results_execution_idx" ON "search_execution_results" USING btree ("search_execution_id");--> statement-breakpoint
CREATE INDEX "search_execution_results_result_idx" ON "search_execution_results" USING btree ("search_result_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_search_result_states_user_result_uidx" ON "user_search_result_states" USING btree ("user_id","search_result_id");--> statement-breakpoint
CREATE INDEX "user_search_result_states_user_idx" ON "user_search_result_states" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_search_result_states_result_idx" ON "user_search_result_states" USING btree ("search_result_id");--> statement-breakpoint
CREATE UNIQUE INDEX "search_profiles_user_key_uidx" ON "search_profiles" USING btree ("created_by_user_id","profile_key") WHERE "search_profiles"."created_by_user_id" is not null and "search_profiles"."profile_key" is not null;--> statement-breakpoint
WITH "ranked_available_profiles" AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "created_by_user_id"
			ORDER BY "created_at" ASC, "id" ASC
		) AS "profile_rank"
	FROM "search_profiles"
	WHERE "created_by_user_id" IS NOT NULL
		AND "source_type" = 'COMPRASAL'
		AND "name" = 'COMPRASAL — búsqueda de oportunidades'
)
UPDATE "search_profiles" AS "profile"
SET "profile_key" = 'AVAILABLE_SEARCH',
	"updated_at" = now()
FROM "ranked_available_profiles" AS "ranked"
WHERE "profile"."id" = "ranked"."id"
	AND "ranked"."profile_rank" = 1;--> statement-breakpoint
UPDATE "search_executions" AS "execution"
SET "metrics" = coalesce("execution"."metrics", '{}'::jsonb)
	|| '{"searchMode":"AVAILABLE_SEARCH"}'::jsonb
FROM "search_profiles" AS "profile"
WHERE "execution"."search_profile_id" = "profile"."id"
	AND "profile"."created_by_user_id" IS NOT NULL
	AND "profile"."source_type" = 'COMPRASAL'
	AND "execution"."metrics"->>'searchProvider' = 'COMPRASAL_AVAILABLE_API'
	AND coalesce("execution"."metrics"->>'searchMode', '') = '';--> statement-breakpoint
INSERT INTO "search_execution_results" (
	"search_execution_id",
	"search_result_id",
	"preliminary_score",
	"rank",
	"created_at"
)
SELECT
	"legacy"."search_execution_id",
	"legacy"."id",
	CASE
		WHEN coalesce("trace"."score", "legacy"."preliminary_score") IS NULL
			THEN NULL
		ELSE least(
			100,
			greatest(0, coalesce("trace"."score", "legacy"."preliminary_score"))
		)
	END,
	coalesce(
		"trace"."rank",
		row_number() OVER (
			PARTITION BY "legacy"."search_execution_id"
			ORDER BY "legacy"."preliminary_score" DESC NULLS LAST,
				"legacy"."created_at" ASC,
				"legacy"."id" ASC
		)::integer
	),
	"legacy"."created_at"
FROM "search_results" AS "legacy"
INNER JOIN "search_executions" AS "execution"
	ON "execution"."id" = "legacy"."search_execution_id"
LEFT JOIN LATERAL (
	SELECT
		CASE
			WHEN "candidate"."value"->>'preliminaryScore' ~ '^\d{1,3}$'
				THEN ("candidate"."value"->>'preliminaryScore')::integer
			ELSE NULL
		END AS "score",
		"candidate"."ordinality"::integer AS "rank"
	FROM jsonb_array_elements(
		CASE
			WHEN jsonb_typeof("execution"."metrics"->'executionCandidates') = 'array'
				THEN "execution"."metrics"->'executionCandidates'
			ELSE '[]'::jsonb
		END
	) WITH ORDINALITY AS "candidate"("value", "ordinality")
	WHERE "candidate"."value"->>'searchResultId' = "legacy"."id"::text
	ORDER BY "candidate"."ordinality"
	LIMIT 1
) AS "trace" ON true
WHERE "legacy"."search_execution_id" IS NOT NULL
ON CONFLICT ("search_execution_id", "search_result_id") DO NOTHING;

-- Compatibility notes:
-- 1. search_results.search_execution_id remains in place for legacy readers.
-- 2. Historical REJECTED/deleted rows are not converted into private user states,
--    because the original actor and intent cannot be established safely.
-- 3. No row is deleted or reassigned by this migration.
--
-- Manual rollback order (only if the application has first been rolled back):
-- DROP INDEX IF EXISTS search_profiles_user_key_uidx;
-- ALTER TABLE search_profiles DROP COLUMN IF EXISTS profile_key;
-- DROP TABLE IF EXISTS user_search_result_states;
-- DROP TABLE IF EXISTS search_execution_results;
