"use client";

import { useMemo, useState } from "react";
import { ExternalLinkIcon, FileSearch } from "lucide-react";

import { ExternalLink } from "@/components/shared/external-link";
import { Badge } from "@/components/ui/badge";
import { SkeuButton } from "@/components/ui/skeu-button";
import {
  candidateMatchesFilter,
  formatCandidateOutcome,
  formatCandidateReason,
  formatCandidateStage,
  type SearchActivityFilter,
  type SearchExecutionCandidateView,
  type SearchExecutionDetail,
} from "@/features/projects/search-execution-activity";
import {
  formatPrivateSearchOutcome,
  topDiscardReasons,
} from "@/features/projects/private-search-labels";
import { searchStatusLabel } from "@/features/projects/search-activity-status";
import { cn } from "@/lib/utils";

const FILTERS: Array<{ value: SearchActivityFilter; label: string }> = [
  { value: "ALL", label: "Todos" },
  { value: "VERIFIED", label: "Verificados" },
  { value: "FILTERED", label: "Filtrados" },
  { value: "REJECTED", label: "Rechazados" },
  { value: "ERROR", label: "Errores" },
];

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-md border border-surface-border bg-surface-base px-3 py-3">
      <dt className="truncate text-[11px] font-medium tracking-wide text-text-secondary uppercase">
        {label}
      </dt>
      <dd className="mt-1 font-heading text-xl font-semibold text-text-primary tabular-nums">
        {value}
      </dd>
    </div>
  );
}

function CandidateBadge({
  candidate,
}: {
  candidate: SearchExecutionCandidateView;
}) {
  const destructive =
    candidate.outcome === "ERROR" || candidate.outcome === "REJECTED";
  const verified = ["VERIFIED", "CREATED", "UPDATED", "UNCHANGED"].includes(
    candidate.outcome,
  );
  return (
    <Badge
      variant={destructive ? "destructive" : verified ? "secondary" : "outline"}
      className={cn(
        verified && "bg-accent-mint text-accent-dark",
        candidate.outcome === "UNVERIFIED" && "border-warning/30 text-warning",
      )}
    >
      {formatCandidateOutcome(candidate)}
    </Badge>
  );
}

function CandidateCard({
  candidate,
}: {
  candidate: SearchExecutionCandidateView;
}) {
  const visibleReason =
    candidate.reason ?? formatCandidateReason(candidate.reasonCode);
  const score = candidate.preliminaryScore ?? candidate.retrievalScore;

  return (
    <article className="rounded-md border border-surface-border bg-surface-raised p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-heading text-sm font-semibold text-text-primary">
            {candidate.title ?? "Candidato sin título"}
          </h4>
          <p className="mt-0.5 text-sm text-text-secondary">
            {candidate.organizationName ?? "Organización no identificada"}
          </p>
        </div>
        <CandidateBadge candidate={candidate} />
      </div>

      {candidate.summary ? (
        <p className="mt-3 line-clamp-3 text-sm leading-5 text-text-secondary">
          {candidate.summary}
        </p>
      ) : null}

      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
        <div className="inline-flex gap-1">
          <dt>Etapa:</dt>
          <dd className="font-medium text-text-primary">
            {formatCandidateStage(candidate.stage)}
          </dd>
        </div>
        {candidate.sourceDomain ? (
          <div className="inline-flex gap-1">
            <dt>Dominio:</dt>
            <dd className="font-medium text-text-primary">
              {candidate.sourceDomain}
            </dd>
          </div>
        ) : null}
        {candidate.deadlineAt ? (
          <div className="inline-flex gap-1">
            <dt>Fecha límite:</dt>
            <dd className="font-medium text-text-primary">
              {new Date(candidate.deadlineAt).toLocaleDateString("es-SV")}
            </dd>
          </div>
        ) : null}
        {candidate.category ? (
          <div className="inline-flex gap-1">
            <dt>Categoría:</dt>
            <dd className="font-medium text-text-primary">
              {candidate.category}
            </dd>
          </div>
        ) : null}
        {score !== null ? (
          <div className="inline-flex gap-1">
            <dt>Score:</dt>
            <dd className="font-medium text-text-primary">{score}</dd>
          </div>
        ) : null}
      </dl>

      {visibleReason ? (
        <div
          className={cn(
            "mt-3 rounded-md border px-3 py-2 text-sm",
            candidate.outcome === "ERROR"
              ? "border-danger/20 bg-danger/5 text-danger"
              : "border-surface-border bg-surface-base text-text-secondary",
          )}
        >
          {visibleReason}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {candidate.officialSourceUrl ? (
          <SkeuButton asChild size="sm" variant="outline">
            <ExternalLink href={candidate.officialSourceUrl}>
              Abrir fuente
              <ExternalLinkIcon className="size-3" aria-hidden />
            </ExternalLink>
          </SkeuButton>
        ) : null}
        {candidate.applicationUrl ? (
          <SkeuButton asChild size="sm" variant="outline">
            <ExternalLink href={candidate.applicationUrl}>
              Abrir aplicación
              <ExternalLinkIcon className="size-3" aria-hidden />
            </ExternalLink>
          </SkeuButton>
        ) : null}
        <details className="group text-xs text-text-secondary">
          <summary className="cursor-pointer list-none rounded-md px-2 py-1.5 font-medium hover:bg-surface-pressed hover:text-text-primary">
            Ver diagnóstico
          </summary>
          <div className="mt-2 min-w-64 space-y-1 rounded-md border border-surface-border bg-surface-base p-3">
            <p>
              Código:{" "}
              <span className="font-mono">{candidate.reasonCode ?? "—"}</span>
            </p>
            <p>Estado de verificación: {candidate.verificationStatus ?? "—"}</p>
            {candidate.discoveredByFamilies.length > 0 ? (
              <p>Familias: {candidate.discoveredByFamilies.join(", ")}</p>
            ) : null}
            {candidate.discoveredByQueries.length > 0 ? (
              <p>Consultas: {candidate.discoveredByQueries.join(" · ")}</p>
            ) : null}
          </div>
        </details>
      </div>
    </article>
  );
}

export function ExecutionDetailView({
  detail,
}: {
  detail: SearchExecutionDetail;
}) {
  const [filter, setFilter] = useState<SearchActivityFilter>("ALL");
  const filteredCandidates = useMemo(
    () =>
      detail.candidates.filter((candidate) =>
        candidateMatchesFilter(candidate, filter),
      ),
    [detail.candidates, filter],
  );
  const summary = detail.summary;
  const topDiscards = topDiscardReasons(detail.discardCounts, 3);
  const filteredWithoutVerification =
    detail.execution.outcome === "COMPLETED_ALL_FILTERED" ||
    (summary.candidatesFiltered > 0 &&
      summary.candidatesVerified === 0 &&
      summary.candidatesFound > 0);

  return (
    <section className="space-y-5" aria-labelledby="execution-detail-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3
              id="execution-detail-title"
              className="font-heading text-base font-semibold"
            >
              Búsqueda del sector privado
            </h3>
            <Badge variant="secondary">
              {searchStatusLabel(detail.execution.status)}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            {new Date(
              detail.execution.completedAt ?? detail.execution.createdAt,
            ).toLocaleString("es-SV")}
            {detail.execution.searchProvider
              ? ` · ${detail.execution.searchProvider}`
              : ""}
            {detail.execution.estimatedCost
              ? ` · Costo estimado $${detail.execution.estimatedCost}`
              : ""}
          </p>
        </div>
        {detail.execution.outcome ? (
          <Badge variant="outline">
            {formatPrivateSearchOutcome(detail.execution.outcome)}
          </Badge>
        ) : null}
      </div>

      {filteredWithoutVerification ? (
        <div className="rounded-md border border-warning/25 bg-warning/5 px-4 py-3 text-sm text-text-primary">
          Se normalizaron {summary.candidatesFound} candidato
          {summary.candidatesFound === 1 ? "" : "s"} y{" "}
          {summary.candidatesFiltered} quedó
          {summary.candidatesFiltered === 1 ? "" : "ron"} filtrado
          {summary.candidatesFiltered === 1 ? "" : "s"}
          {topDiscards[0]
            ? ` (${topDiscards[0].label}: ${topDiscards[0].count})`
            : ""}
          . Ninguno llegó a verificación.
        </div>
      ) : null}
      {!filteredWithoutVerification &&
      summary.candidatesFound > 0 &&
      summary.candidatesVerified === 0 ? (
        <div className="rounded-md border border-warning/25 bg-warning/5 px-4 py-3 text-sm text-text-primary">
          Se encontraron {summary.candidatesFound} candidato
          {summary.candidatesFound === 1 ? "" : "s"}, pero ninguno superó la
          verificación.
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        <SummaryCard label="Resultados web" value={summary.providerResults} />
        <SummaryCard label="URLs únicas" value={summary.uniqueUrls} />
        <SummaryCard label="Dominios" value={summary.uniqueDomains} />
        <SummaryCard
          label="Docs. analizados"
          value={summary.documentsExtracted}
        />
        <SummaryCard label="Candidatos" value={summary.candidatesFound} />
        <SummaryCard label="Filtrados" value={summary.candidatesFiltered} />
        <SummaryCard label="Verificados" value={summary.candidatesVerified} />
        <SummaryCard label="Guardados" value={summary.saved} />
      </dl>

      {topDiscards.length > 0 ? (
        <dl className="flex flex-wrap gap-2 text-xs text-text-secondary">
          {topDiscards.map((item) => (
            <div
              key={item.reason}
              className="rounded-md border border-surface-border bg-surface-base px-2.5 py-1.5"
            >
              <dt className="inline font-medium text-text-primary">
                {item.label}
              </dt>
              <dd className="ml-1 inline tabular-nums">{item.count}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-heading text-sm font-semibold text-text-primary">
            Resultados y diagnóstico
          </h3>
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-md bg-surface-base p-1">
            {FILTERS.map((item) => {
              const count = detail.candidates.filter((candidate) =>
                candidateMatchesFilter(candidate, item.value),
              ).length;
              return (
                <button
                  key={item.value}
                  type="button"
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                    filter === item.value
                      ? "bg-surface-raised text-text-primary shadow-sm"
                      : "text-text-secondary hover:text-text-primary",
                  )}
                  onClick={() => setFilter(item.value)}
                >
                  {item.label} · {count}
                </button>
              );
            })}
          </div>
        </div>

        {filteredCandidates.length > 0 ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {filteredCandidates.map((candidate) => (
              <CandidateCard key={candidate.temporaryId} candidate={candidate} />
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-surface-border px-4 py-8 text-center">
            <FileSearch
              className="mx-auto size-5 text-text-secondary"
              aria-hidden
            />
            <p className="mt-2 text-sm font-medium text-text-primary">
              No hay resultados en este filtro
            </p>
            <p className="mt-1 text-xs text-text-secondary">
              Las ejecuciones históricas pueden contener solo métricas
              agregadas.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
