import { CalendarDays, Globe2 } from "lucide-react";
import { z } from "zod";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { DiscoverOpportunitiesMenu } from "@/features/projects/discover-opportunities-menu";
import { searchStatusLabel } from "@/features/projects/search-activity-status";
import { ExecutionDetailView } from "@/features/projects/search-execution-detail";
import { SearchExecutionHistory } from "@/features/projects/search-execution-history";
import { requireSession } from "@/server/auth/session";
import { getLatestComprasalSync } from "@/server/integrations/comprasal/service";
import {
  getUserSearchExecutionDetail,
  listUserSearchExecutions,
} from "@/server/services/search-execution.service";

const executionParamSchema = z.uuid();

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const rawExecutionParam = Array.isArray(params.execution)
    ? params.execution[0]
    : params.execution;
  const requestedExecutionId = executionParamSchema.safeParse(
    rawExecutionParam,
  ).success
    ? (rawExecutionParam as string)
    : null;

  const [executions, comprasal] = await Promise.all([
    listUserSearchExecutions({ userId: session.user.id, limit: 20 }),
    getLatestComprasalSync(),
  ]);

  const selectedId = requestedExecutionId ?? executions[0]?.id ?? null;

  const detail = selectedId
    ? await getUserSearchExecutionDetail({
        executionId: selectedId,
        userId: session.user.id,
      })
    : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Actividad de búsqueda"
        description="Historial y diagnóstico de las búsquedas de discovery, separados del catálogo verificado."
        actions={<DiscoverOpportunitiesMenu />}
      />

      <section className="space-y-3" aria-labelledby="history-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id="history-title"
            className="font-heading text-sm font-semibold text-text-primary"
          >
            Últimas ejecuciones
          </h2>
          <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
            <Globe2 className="size-3.5" aria-hidden />
            Hasta 20 búsquedas
          </span>
        </div>
        <SearchExecutionHistory items={executions} selectedId={selectedId} />
      </section>

      {executions.length === 0 ? (
        <EmptyState
          title="Aún no hay búsquedas del sector privado"
          description="Inicia una búsqueda para ver aquí el detalle de resultados, filtros y verificación."
          action={<DiscoverOpportunitiesMenu />}
        />
      ) : detail ? (
        <div className="rounded-md border border-surface-border bg-surface-raised p-4 sm:p-6">
          <ExecutionDetailView key={detail.execution.id} detail={detail} />
        </div>
      ) : (
        <EmptyState
          title="No se encontró esa ejecución"
          description="Puede pertenecer a otro usuario o haber sido eliminada. Selecciona una ejecución del historial."
        />
      )}

      {comprasal ? (
        <section className="rounded-md border border-surface-border bg-surface-base px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 font-medium">
              <CalendarDays className="size-4 text-accent" aria-hidden />
              Última sincronización COMPRASAL
            </span>
            <span className="text-text-secondary">
              {comprasal.completedAt
                ? new Date(comprasal.completedAt).toLocaleString("es-SV")
                : searchStatusLabel(comprasal.status)}
            </span>
          </div>
        </section>
      ) : null}
    </div>
  );
}
