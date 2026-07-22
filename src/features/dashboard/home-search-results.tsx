import Link from "next/link";
import { FileSearch } from "lucide-react";

import type { SearchExecutionDetail } from "@/features/projects/search-execution-activity";
import { homeSearchResultHref } from "@/lib/home-search-href";
import { homeSearchResultLeadKey } from "@/lib/home-search-result-id";
import { homeSearchResultSector } from "@/lib/home-search-result-sector";
import { buildSearchExecutionTitle } from "@/lib/search-execution-title";
import { cn } from "@/lib/utils";

function formatDeadline(value: string | null): string {
  if (!value) {
    return "Sin fecha límite";
  }

  return new Date(value).toLocaleDateString("es-SV", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function HomeSearchResults({
  detail,
}: {
  detail: SearchExecutionDetail;
}) {
  const candidates = detail.candidates;
  const queryTitle =
    buildSearchExecutionTitle({
      userQuery: detail.execution.query,
      sourceType: detail.execution.sourceType,
      at: detail.execution.createdAt,
    }) ?? "Resultados de la búsqueda";

  return (
    <section
      className="mx-auto flex w-full max-w-5xl flex-1 flex-col"
      aria-labelledby="home-search-results-title"
    >
      <header className="mb-6 shrink-0">
        <h2
          id="home-search-results-title"
          className="font-heading text-lg font-semibold text-text-primary md:text-xl"
        >
          {queryTitle}
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          {candidates.length} resultado{candidates.length === 1 ? "" : "s"}
        </p>
      </header>

      {detail.execution.status === "PARTIALLY_COMPLETED" &&
      detail.execution.sourceType !== "COMPRASAL" ? (
        <div className="mb-4 rounded-md border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning" role="status">
          La búsqueda terminó parcialmente. Algunos sitios o resultados no
          pudieron procesarse.
        </div>
      ) : null}

      {candidates.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-md border border-dashed border-surface-border px-4 py-16 text-center">
          <FileSearch
            className="size-6 text-text-secondary"
            aria-hidden
          />
          <p className="mt-3 text-sm font-medium text-text-primary">
            {detail.execution.status === "FAILED"
              ? "No fue posible completar la búsqueda."
              : detail.execution.status === "PARTIALLY_COMPLETED"
                ? "La búsqueda terminó parcialmente, pero no se verificaron oportunidades."
                : "No encontramos oportunidades verificadas para esta búsqueda."}
          </p>
          <p className="mt-1 max-w-sm text-xs text-text-secondary">
            {detail.execution.status === "FAILED"
              ? "Puedes intentarlo nuevamente más tarde."
              : detail.execution.status === "PARTIALLY_COMPLETED"
                ? "Algunas fuentes no pudieron procesarse; puedes revisar la actividad de la búsqueda."
                : "Prueba con otros términos o revisa otra búsqueda del historial."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3 overflow-y-auto pb-2">
          {candidates.map((candidate) => {
            const sector = homeSearchResultSector(candidate);
            const leadKey = homeSearchResultLeadKey(candidate);
            const detailHref = homeSearchResultHref(
              detail.execution.id,
              leadKey,
            );
            const description =
              candidate.summary ??
              candidate.organizationName ??
              "Sin descripción disponible";

            return (
              <li key={leadKey}>
                <Link
                  href={detailHref}
                  className="block rounded-md border border-surface-border bg-surface-raised p-4 font-normal text-inherit no-underline transition-colors hover:border-accent/40 hover:bg-accent-mint/20 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="min-w-0 font-heading text-sm font-semibold text-text-primary">
                      {candidate.title ?? "Oportunidad sin título"}
                    </h3>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                      {candidate.verificationStatus === "PARTIALLY_VERIFIED" ? (
                        <span className="rounded-md border border-warning/30 bg-warning/5 px-2 py-0.5 text-[11px] font-medium text-warning">
                          Verificación parcial
                        </span>
                      ) : candidate.verificationStatus === "VERIFIED" ? (
                        <span className="rounded-md border border-accent/25 bg-accent-mint px-2 py-0.5 text-[11px] font-medium text-accent-dark">
                          Verificada
                        </span>
                      ) : null}
                      <span
                        className={cn(
                          "rounded-md border px-2 py-0.5 text-[11px] font-medium",
                          sector === "Público"
                            ? "border-accent/25 bg-accent-mint text-accent-dark"
                            : "border-surface-border bg-surface-base text-text-secondary",
                        )}
                      >
                        {sector}
                      </span>
                    </div>
                  </div>
                  {candidate.organizationName ? (
                    <p className="mt-1 text-xs font-medium text-text-primary">
                      {candidate.organizationName}
                    </p>
                  ) : null}
                  <p className="mt-2 line-clamp-2 text-sm leading-5 text-text-secondary">
                    {description}
                  </p>
                  {candidate.sourceDomain ? (
                    <p className="mt-2 text-xs text-text-secondary">
                      Fuente: {candidate.sourceDomain}
                    </p>
                  ) : null}
                  <p className="mt-3 text-xs text-text-secondary">
                    {detail.execution.sourceType === "COMPRASAL"
                      ? "Cierre"
                      : "Fecha límite"}
                    :{" "}
                    <span className="font-medium text-text-primary">
                      {candidate.verificationStatus === "PARTIALLY_VERIFIED" &&
                      !candidate.deadlineAt
                        ? "No confirmada · revisión manual"
                        : formatDeadline(candidate.deadlineAt)}
                    </span>
                  </p>
                  {candidate.publishedAt || candidate.estimatedAmount ? (
                    <p className="mt-1 text-xs text-text-secondary">
                      {candidate.publishedAt
                        ? `Publicada ${new Date(candidate.publishedAt).toLocaleDateString("es-SV")}`
                        : ""}
                      {candidate.publishedAt && candidate.estimatedAmount
                        ? " · "
                        : ""}
                      {candidate.estimatedAmount
                        ? `${candidate.currency ?? "USD"} ${candidate.estimatedAmount}`
                        : ""}
                    </p>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
