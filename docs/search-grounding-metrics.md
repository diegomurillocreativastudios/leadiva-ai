# Private Search Grounding — Metrics & Diagnostics

> Observability contract for `POST /api/jobs/search-grounding` → `runGroundedSearch`.
> Last updated: 2026-07-16

## Metric semantics

| Metric | Definition | Stage |
| --- | --- | --- |
| `queriesExecuted` | `groundingMetadata.webSearchQueries.length` when present; otherwise fallback discovery-query count with `queriesExecutedEstimated=true` | Discovery |
| `groundingChunksFound` / `groundingSourcesFound` | Chunks/sources returned by Google Search Grounding | Discovery |
| `groundingDomainsFound` | Unique domains among grounding chunks | Discovery |
| `groundingUrlsFound` / `groundingUniqueUrlsFound` | URL counts from grounding chunks | Discovery |
| `hasGroundingSupports` | Whether groundingSupports metadata was present | Discovery |
| `rawCandidatesFound` | `[OPPORTUNITY]` / `[UNVERIFIED]` blocks in discovery text | Discovery |
| `searchPlanIntents` | Intents selected by the planner (family, language, query, regional flag) | Planning |
| `searchFamiliesExecuted` / `groundingPassesExecuted` | Families and Grounded passes actually run | Discovery |
| `sourcesByFamily` / `domainsByFamily` | Source and domain yield per family | Discovery |
| `rawCandidatesByFamily` / `normalizedCandidatesByFamily` | Extraction yield per family before global dedupe | Normalization |
| `uniqueCandidatesBeforeFilters` | Global URL / organization-title unique candidates before existing filters | Deduplication |
| `crossBatchDuplicates` | Candidates repeated by more than one pass | Deduplication |
| `passesWithoutNewSources` / `passesWithoutNewCandidates` | Fan-out saturation signals | Discovery |
| `stoppedBy` | `PLAN_EXHAUSTED` or configured budget/pass limit | Budget |
| `normalizationOutputItems` | Raw items returned by structuring / document extraction | Normalization |
| `schemaValidCandidatesBeforeDeduplication` | Items that passed local shape checks before global URL/title dedupe | Normalization |
| `schemaInvalidCandidates` | Items dropped individually without failing the batch | Normalization |
| `crossBatchDuplicates` | Candidates removed by global dedupe (`schemaValidBeforeDedup − uniqueNormalized`) | Deduplication |
| `uniqueNormalizedCandidates` | Canonical candidates after global dedupe; this is what filters receive | Deduplication |
| `schemaValidCandidates` | **Alias of** `schemaValidCandidatesBeforeDeduplication` (kept for historical dashboards) | Normalization |
| `normalizedCandidatesFound` | **Alias of** `uniqueNormalizedCandidates` (post-dedupe) | Deduplication |
| `rawCandidatesFound` | Provider: `normalizationOutputItems`. Grounding: opportunity blocks in discovery text | Discovery |
| **`candidatesFound`** | **Equals `uniqueNormalizedCandidates`** (schema-valid after dedupe, before filters) | Normalization → Filters |
| `candidatesFiltered` | Rejected by `preparePrivateBatch` filters + in-batch dedupe | Filtering |
| `candidatesDeduplicated` | `DUPLICATE_IN_BATCH` count | Deduplication |
| `candidatesSentToVerification` | Accepted after filters | Verification |
| `candidatesVerified` / `PartiallyVerified` / `Rejected` | Verification status tallies | Verification |
| `candidatesCreated` / `Updated` / `Unchanged` | Persistence outcomes (`contentHash` skip = unchanged) | Persistence |
| `candidatesDiscarded` | Sum of filter + verification discard bumps + persist errors | Across stages |
| `discardCounts` | Stable reason codes → counts | Across stages |
| `acceptedCandidates` | `created + updated` (legacy-compatible persisted delta) | Persistence |

Provider mode adds a second, unambiguous normalization funnel:

| Metric | Definition |
| --- | --- |
| `normalizationOutputItems` | Raw items returned across document extraction calls |
| `schemaValidCandidatesBeforeDeduplication` | Items converted to the canonical candidate schema before global dedupe |
| `schemaInvalidCandidates` | Items rejected individually during draft/canonical validation |
| `uniqueNormalizedCandidates` | Canonical candidates after global URL and organization/title dedupe; this is `candidatesFound` in provider mode |

The reconciliation is:

```text
normalizationOutputItems
= schemaValidCandidatesBeforeDeduplication + schemaInvalidCandidates

uniqueNormalizedCandidates
= schemaValidCandidatesBeforeDeduplication - cross-batch duplicates
```

### Important distinction

Previously `candidatesFound = created + updated`, which made `0` ambiguous (Search empty vs all filtered vs all unchanged).

Now:

```text
candidatesFound  = normalized schema-valid candidates (pre-filter)
acceptedCandidates = created + updated (post-persistence writes)
candidatesUnchanged = existing rows with identical contentHash
```

## Outcomes (`metrics.outcome`)

Stored in `search_executions.metrics` (jsonb). HTTP `status` remains `COMPLETED` / `FAILED`.

| Outcome | Condition |
| --- | --- |
| `COMPLETED_NO_GROUNDING_SOURCES` | No grounding chunks/sources |
| `COMPLETED_EMPTY_DISCOVERY_RESPONSE` | Sources present, discovery text empty |
| `COMPLETED_NO_NORMALIZED_CANDIDATES` | Sources + text, zero schema-valid candidates |
| `COMPLETED_ALL_FILTERED` | Candidates found, none reached verification |
| `COMPLETED_ALL_DUPLICATES` | All discarded as `DUPLICATE_IN_BATCH` |
| `COMPLETED_ALL_UNVERIFIED` | Reached verification, none verified, nothing persisted |
| `COMPLETED_ALL_UNCHANGED` | Persistence only `unchanged` |
| `COMPLETED_WITH_PERSISTED_RESULTS` | At least one created or updated |
| `COMPLETED_WITH_RESULTS` | Fallback completed path |
| `FAILED_DISCOVERY` / `FAILED_NORMALIZATION` / `FAILED_PERSISTENCE` | Stage failures |
| `VERTEX_NOT_CONFIGURED` | GCP/Vertex not configured |
| `PROVIDER_NOT_CONFIGURED` | Provider mode enabled without a server-side API key |
| `COMPLETED_NO_PROVIDER_RESULTS` / `COMPLETED_NO_UNIQUE_URLS` | Provider or URL normalization produced no usable URLs |
| `COMPLETED_NO_RELEVANT_SEARCH_RESULTS` | Retrieval classifier selected no fetch candidates |
| `COMPLETED_NO_FETCHABLE_DOCUMENTS` | Safety, robots, HTTP or content limits blocked every document |
| `COMPLETED_NO_EXTRACTED_CANDIDATES` | Documents were processed but yielded no canonical candidates |
| `FAILED_PROVIDER_AUTH` / `FAILED_PROVIDER_RATE_LIMIT` / `FAILED_PROVIDER` | Provider operational failures |
| `FAILED_DOCUMENT_FETCH` / `FAILED_EXTRACTION` | Systemic document or extraction failures |

Provider metrics stored in the same JSONB include provider queries/requests,
results and unique domains; query-family and domain yields; URL duplicates;
classifier decisions; robots checks; fetch attempts, bytes and content types;
PDF processing; extraction counts/tokens; conditional Grounding verification;
estimated provider/Vertex/total cost; and `stoppedBy`.

## Persisted diagnostics

No migration required. Diagnostics live in existing `search_executions.metrics` jsonb.

Also retained:

- `promptVersion`, `query`, `searchQueries` / `webSearchQueries`
- Truncated discovery text (`discoveryTextPreview`, max **1500** chars)
- Truncated normalization preview (max **2000** chars)
- `finishReason`, tokens, durations per stage
- `normalizationParseError` / `normalizationFailureKind`
- `discardCounts`
- `discardedTraceSample` (max **25** rejected/error traces with title, org, URL, stage, reason)

### Storage limits (`DIAGNOSTIC_LIMITS`)

| Limit | Value |
| --- | --- |
| Discovery text preview | 1 500 chars |
| Normalization preview | 2 000 chars |
| Discarded trace sample | 25 |
| Grounding chunk summaries | 30 |
| Web search queries stored | 20 |

Do not log full model responses or secrets.

`normalizationFailureKind` distinguishes empty model responses, empty arrays,
invalid JSON, rejected roots, partially invalid items, model discard decisions,
normalization request failures, and empty/truncated input. A request failure is
never recorded as an empty opportunities array.

## Discovery fan-out configuration

Discovery uses independent intent families rather than one boolean mega-query:
explicit procurement, outcome/provider hiring, project solution, specific
services, procurement pages, organization types, LinkedIn discovery, and a
limited regional complement. The default plan is 75% global and 25% regional.

The first Grounded call uses `temperature: 1.0`; the tool-free JSON
normalization remains `temperature: 0`. `SEARCH_GROUNDING_PASSES`,
`SEARCH_MAX_QUERIES`, token ceilings, estimated-cost ceiling, target-candidate
ceiling, and `SEARCH_GROUNDING_CONCURRENCY` bound the work. Each Grounded pass
is normalized independently, then candidates are deduplicated globally by URL
and organization/title before existing filters and verification.

## Debugging “no persisted results”

1. Read `metrics.outcome`.
2. Check `groundingSourcesFound` and `queriesExecuted` / `queriesExecutedEstimated`.
3. Check `rawCandidatesFound` vs `candidatesFound` / `schemaInvalidCandidates`.
4. Inspect `discardCounts` and `discardedTraceSample`.
5. If `FAILED_NORMALIZATION`, read `normalizationFailureKind` + `normalizationParseError`.

## Real discard reason codes

From filters / prepare / verification persistence:

`INVALID`, `NOISE`, `PUBLIC_SECTOR`, `IRRELEVANT`, `EXPIRED`, `DUPLICATE_IN_BATCH`, `UNREACHABLE`, `UNGROUNDED_SOURCE`, `REJECTED`, `PARTIALLY_VERIFIED`, `PERSIST_ERROR`, `AGGREGATOR_INDEX_PAGE`, `OFFICIAL_LINK_NOT_FOUND`, `SPECIFIC_OPPORTUNITY_NOT_FOUND`, `VERIFICATION_SOURCE_MISMATCH`.

### PROVIDER_SEARCH log events

Discovery in provider mode emits:

- `provider_search_started`
- `provider_search_completed`
- `provider_results_extracted`

`grounding_request_*` / `grounding_sources_extracted` are reserved for directed verification (and GROUNDING_ONLY discovery). Historical GROUNDING_ONLY executions keep the previous event names.
