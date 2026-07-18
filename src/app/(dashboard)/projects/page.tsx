import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SkeuButton } from "@/components/ui/skeu-button";
import { DiscoverOpportunitiesMenu } from "@/features/projects/discover-opportunities-menu";
import { HowItWorksLink } from "@/features/projects/how-it-works-link";
import { OpportunitiesMetrics } from "@/features/projects/opportunities-metrics";
import { projectFiltersAreRestrictive } from "@/features/projects/project-filter-chips";
import { ProjectsFilters } from "@/features/projects/projects-filters";
import { ProjectsPagination } from "@/features/projects/projects-pagination";
import { ProjectsTable } from "@/features/projects/projects-table";
import { SearchActivityTrigger } from "@/features/projects/search-activity-trigger";
import { SyncStatusBar } from "@/features/projects/sync-status-bar";
import {
  buildClearedProjectFiltersQuery,
  parseProjectFilters,
} from "@/schemas/projects";
import { requireSession } from "@/server/auth/session";
import { getLatestComprasalSync } from "@/server/integrations/comprasal/service";
import { getLatestPrivateSearch } from "@/server/integrations/vertex-ai/service";
import {
  getSearchResultCatalogStats,
  listRecentSearchExecutions,
  listSearchResults,
} from "@/server/services/opportunity.service";
import {
  buildSearchExecutionSummary,
  formatSearchFunnelLine,
  readDiscardCounts,
} from "@/features/projects/search-execution-activity";
import {
  describePrivateSearchCatalogEmpty,
  topDiscardReasons,
} from "@/features/projects/private-search-labels";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();

  const params = await searchParams;
  const filters = parseProjectFilters(params);

  const listFilters = {
    ...filters,
    interestCategories: session.user.interestCategories,
  };

  const [result, executions, latestComprasalSync, latestPrivateSearch, stats] =
    await Promise.all([
      listSearchResults(listFilters),
      listRecentSearchExecutions(20, session.user.id),
      getLatestComprasalSync(),
      getLatestPrivateSearch("PRIVATE_WEB", session.user.id),
      getSearchResultCatalogStats(),
    ]);

  const hasActiveFilters = projectFiltersAreRestrictive(filters);

  const privateSearchMetrics =
    (latestPrivateSearch?.metrics as Record<string, unknown> | null) ?? null;
  const privateSearchSummary = latestPrivateSearch
    ? buildSearchExecutionSummary({
        metrics: privateSearchMetrics,
        candidatesFound: latestPrivateSearch.candidatesFound,
        candidatesDiscarded: latestPrivateSearch.candidatesDiscarded,
      })
    : null;
  const privateSearchDiscardReasons = topDiscardReasons(
    readDiscardCounts(privateSearchMetrics),
    1,
  );
  const privateSearchEmpty = privateSearchSummary
    ? describePrivateSearchCatalogEmpty({
        outcome:
          typeof privateSearchMetrics?.outcome === "string"
            ? privateSearchMetrics.outcome
            : null,
        candidatesFound: privateSearchSummary.candidatesFound,
        candidatesVerified: privateSearchSummary.candidatesVerified,
        candidatesFiltered: privateSearchSummary.candidatesFiltered,
        funnelLine: formatSearchFunnelLine(privateSearchSummary),
        topDiscardLabel: privateSearchDiscardReasons[0]
          ? `${privateSearchDiscardReasons[0].label} (${privateSearchDiscardReasons[0].count})`
          : null,
      })
    : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Oportunidades de licitación"
        description={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <p>
              Monitorea, busca y filtra convocatorias públicas y del sector
              privado. Evalúalas y conviértelas en leads.
            </p>
            <HowItWorksLink />
          </div>
        }
        actions={<DiscoverOpportunitiesMenu />}
      />

      <OpportunitiesMetrics stats={stats} />

      <SyncStatusBar
        comprasal={latestComprasalSync}
        privateSearch={latestPrivateSearch}
      />

      <ProjectsFilters filters={filters} executions={executions} />

      {result.items.length === 0 ? (
        result.catalogTotal === 0 ? (
          <EmptyState
            title={
              privateSearchEmpty?.title ?? "Aún no hay oportunidades descubiertas"
            }
            description={
              privateSearchEmpty?.description ??
              "Empieza por descubrir oportunidades desde COMPRASAL o el sector privado."
            }
            action={
              latestPrivateSearch ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <SearchActivityTrigger executionId={latestPrivateSearch.id} />
                  <DiscoverOpportunitiesMenu />
                </div>
              ) : (
                <DiscoverOpportunitiesMenu />
              )
            }
          />
        ) : (
          <EmptyState
            title="No encontramos oportunidades con estos filtros."
            description={
              filters.searchExecutionIds.length > 0
                ? "Esa búsqueda no dejó oportunidades en el catálogo (los candidatos se filtraron o ya existían). Quita el filtro de ejecución para ver el resto."
                : hasActiveFilters
                  ? `Hay ${result.catalogTotal} oportunidades en el catálogo, pero ninguna pasa el filtro actual.`
                  : "El catálogo está vacío con estos criterios."
            }
            action={
              <SkeuButton asChild variant="outline">
                <Link
                  href={`/projects${buildClearedProjectFiltersQuery()}`}
                  prefetch={false}
                >
                  Limpiar filtros
                </Link>
              </SkeuButton>
            }
          />
        )
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">
            Mostrando{" "}
            <span className="font-medium text-text-primary">{result.total}</span>{" "}
            oportunidad{result.total === 1 ? "" : "es"}
            {stats.pending > 0
              ? ` · ${stats.pending} nueva${stats.pending === 1 ? "" : "s"} por revisar`
              : null}
          </p>
          <ProjectsTable items={result.items} />
          <ProjectsPagination
            filters={filters}
            total={result.total}
            totalPages={result.totalPages}
          />
        </div>
      )}
    </div>
  );
}
