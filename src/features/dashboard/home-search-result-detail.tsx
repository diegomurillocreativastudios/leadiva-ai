import { ExternalLinkIcon, Info } from "lucide-react";

import { ExternalLink } from "@/components/shared/external-link";
import type {
  ComprasalPipView,
  HomeSearchResultDetailView,
} from "@/lib/home-search-result-detail";
import { cn } from "@/lib/utils";

function DetailField({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold text-text-primary md:text-[15px]">
        {value}
      </dd>
    </div>
  );
}

function PipTemporalStatus({
  stage,
}: {
  stage: ComprasalPipView["stages"][number];
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-md border px-2 py-1 text-[11px] font-medium",
        stage.temporalStatus === "CURRENT" &&
          "border-accent/30 bg-accent-mint text-accent-dark",
        stage.temporalStatus === "COMPLETED" &&
          "border-surface-border bg-surface-base text-text-secondary",
        stage.temporalStatus === "UPCOMING" &&
          "border-surface-border bg-surface-raised text-text-primary",
        stage.temporalStatus === "UNKNOWN" &&
          "border-dashed border-surface-border text-text-secondary",
      )}
    >
      {stage.temporalStatusLabel}
    </span>
  );
}

function ComprasalPipSection({ pip }: { pip: ComprasalPipView }) {
  return (
    <section aria-labelledby="comprasal-pip-title">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div>
          <h2
            id="comprasal-pip-title"
            className="font-heading text-base font-semibold text-text-primary"
          >
            Plan de Implementación del Proceso
          </h2>
          <p className="mt-1 text-xs text-text-secondary">
            El estado de cada etapa se calcula según sus fechas oficiales.
          </p>
        </div>
        {pip.sourceNotice ? (
          <p className="text-xs text-text-secondary">{pip.sourceNotice}</p>
        ) : null}
      </div>

      {pip.offerDeadlineLabel ? (
        <div className="mt-4 rounded-md border border-accent/25 bg-accent-mint/40 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-accent-dark">
            Fecha límite de recepción de ofertas
          </p>
          <p className="mt-1 text-sm font-semibold text-text-primary">
            {pip.offerDeadlineLabel}
          </p>
          {pip.deadlineMismatch ? (
            <p className="mt-1 text-xs text-text-secondary">
              El plan remoto difiere del registro sincronizado; la fecha
              principal de la ficha se conserva sin cambios.
            </p>
          ) : null}
        </div>
      ) : null}

      {pip.stages.length === 0 ? (
        <div className="mt-4 rounded-md border border-dashed border-surface-border px-4 py-6 text-sm text-text-secondary">
          {pip.emptyMessage ??
            "COMPRASAL no publicó el Plan de Implementación para este proceso."}
        </div>
      ) : (
        <>
          <div className="mt-4 hidden overflow-x-auto rounded-md border border-surface-border bg-surface-raised md:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Etapas del Plan de Implementación del Proceso
              </caption>
              <thead className="border-b border-surface-border bg-surface-base text-xs text-text-secondary">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Etapa
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Inicio
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Finalización
                  </th>
                  {pip.showOfficialDuration ? (
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Duración oficial
                    </th>
                  ) : null}
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {pip.stages.map((stage) => (
                  <tr
                    key={`${stage.order}-${stage.name}`}
                    aria-current={stage.isCurrent ? "step" : undefined}
                    className={cn(
                      stage.isCurrent && "bg-accent-mint/25",
                    )}
                  >
                    <th
                      scope="row"
                      className="min-w-52 px-4 py-3 font-medium text-text-primary"
                    >
                      <span className="mr-2 text-xs tabular-nums text-text-secondary">
                        {stage.order}.
                      </span>
                      {stage.name}
                    </th>
                    <td className="min-w-44 px-4 py-3 text-text-secondary">
                      {stage.startsAtLabel ?? "No publicada"}
                    </td>
                    <td className="min-w-44 px-4 py-3 text-text-secondary">
                      {stage.endsAtLabel ?? "No publicada"}
                    </td>
                    {pip.showOfficialDuration ? (
                      <td className="px-4 py-3 text-text-secondary">
                        {stage.officialDurationLabel ?? "No publicada"}
                      </td>
                    ) : null}
                    <td className="min-w-48 px-4 py-3">
                      <PipTemporalStatus stage={stage} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ol className="mt-4 space-y-3 md:hidden">
            {pip.stages.map((stage) => (
              <li
                key={`${stage.order}-${stage.name}`}
                aria-current={stage.isCurrent ? "step" : undefined}
                className={cn(
                  "relative rounded-md border border-surface-border bg-surface-raised px-4 py-4",
                  stage.isCurrent && "border-accent/35 bg-accent-mint/25",
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-surface-border bg-surface-base text-xs font-semibold tabular-nums text-text-secondary">
                    {stage.order}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-text-primary">
                      {stage.name}
                    </h3>
                    <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                      <div>
                        <dt className="font-medium text-text-secondary">
                          Inicio
                        </dt>
                        <dd className="mt-0.5 text-text-primary">
                          {stage.startsAtLabel ?? "No publicada"}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium text-text-secondary">
                          Finalización
                        </dt>
                        <dd className="mt-0.5 text-text-primary">
                          {stage.endsAtLabel ?? "No publicada"}
                        </dd>
                      </div>
                      {stage.officialDurationLabel ? (
                        <div>
                          <dt className="font-medium text-text-secondary">
                            Duración oficial
                          </dt>
                          <dd className="mt-0.5 text-text-primary">
                            {stage.officialDurationLabel}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                    <div className="mt-3">
                      <PipTemporalStatus stage={stage} />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

function ComprasalResultHeader({
  detail,
}: {
  detail: HomeSearchResultDetailView;
}) {
  const comprasal = detail.comprasal;
  if (!comprasal) return null;

  return (
    <header>
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-accent/25 bg-accent-mint px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent-dark">
          COMPRASAL
        </span>
        {comprasal.scoreLabel ? (
          <span className="text-xs font-medium text-text-secondary">
            Relevancia {comprasal.scoreLabel}
          </span>
        ) : null}
      </div>
      <h1
        id="home-search-result-detail-title"
        className="max-w-4xl font-heading text-2xl font-bold leading-tight tracking-tight text-text-primary md:text-[1.75rem]"
      >
        {detail.title}
      </h1>
      {detail.description !== "Sin descripción disponible" ? (
        <p className="mt-2.5 max-w-3xl text-sm leading-6 text-text-secondary whitespace-pre-wrap">
          {detail.description}
        </p>
      ) : null}

      <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        <DetailField label="Código" value={comprasal.code} />
        <DetailField label="Institución" value={comprasal.institution} />
        <DetailField label="Estado" value={comprasal.processStatus} />
        <DetailField
          label="Forma de contratación"
          value={comprasal.contractingMethod}
        />
        <DetailField label="Fecha límite" value={comprasal.deadlineAtLabel} />
        <DetailField
          label="Fecha de publicación"
          value={comprasal.publishedAtLabel}
        />
      </dl>

      {detail.websiteUrl ? (
        <ExternalLink
          href={detail.websiteUrl}
          className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent-mint px-3 py-2 text-sm font-medium no-underline hover:bg-accent-mint/70 hover:no-underline"
        >
          {detail.websiteLabel}
          <ExternalLinkIcon className="size-3.5" aria-hidden />
        </ExternalLink>
      ) : null}
    </header>
  );
}

function ComprasalResultBody({
  detail,
}: {
  detail: HomeSearchResultDetailView;
}) {
  const comprasal = detail.comprasal;
  if (!comprasal) return null;

  return (
    <div className="space-y-8">
      <ComprasalPipSection pip={comprasal.pip} />

      {comprasal.emptyMessage ? (
        <div
          className="flex items-start gap-3 rounded-md border border-surface-border bg-surface-raised px-4 py-3"
          role="status"
        >
          <Info
            className="mt-0.5 size-4 shrink-0 text-text-secondary"
            aria-hidden
          />
          <p className="text-sm leading-5 text-text-secondary">
            {comprasal.emptyMessage} Los datos base del proceso siguen
            disponibles arriba.
          </p>
        </div>
      ) : null}

      {comprasal.summaryFields.length > 0 ||
      comprasal.relevantDates.length > 0 ? (
        <section aria-labelledby="comprasal-award-summary-title">
          <h2
            id="comprasal-award-summary-title"
            className="font-heading text-base font-semibold text-text-primary"
          >
            Informe de adjudicación
          </h2>
          <dl className="mt-3 grid gap-4 rounded-md border border-surface-border bg-surface-raised p-4 sm:grid-cols-2 lg:grid-cols-3">
            {comprasal.summaryFields.map((field) => (
              <DetailField
                key={`${field.label}-${field.value}`}
                label={field.label}
                value={field.value}
              />
            ))}
            {comprasal.relevantDates.map((field) => (
              <DetailField
                key={`${field.label}-${field.value}`}
                label={field.label}
                value={field.value}
              />
            ))}
          </dl>
        </section>
      ) : null}

      {comprasal.bidders.length > 0 ? (
        <section aria-labelledby="comprasal-bidders-title">
          <h2
            id="comprasal-bidders-title"
            className="font-heading text-base font-semibold text-text-primary"
          >
            Oferentes
          </h2>
          <p className="mt-1 text-xs text-text-secondary">
            COMPRASAL no identifica en este informe cuál oferente resultó
            adjudicado.
          </p>
          <div className="mt-3 overflow-x-auto rounded-md border border-surface-border bg-surface-raised">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-surface-border bg-surface-base text-xs text-text-secondary">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Oferente</th>
                  <th className="px-4 py-2.5 font-medium">Fecha de carga</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {comprasal.bidders.map((bidder, index) => (
                  <tr key={`${bidder.name}-${bidder.submittedAtLabel}-${index}`}>
                    <td className="px-4 py-3 font-medium text-text-primary">
                      {bidder.name}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {bidder.submittedAtLabel ?? "Sin fecha publicada"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {comprasal.stages.length > 0 ? (
        <section aria-labelledby="comprasal-stages-title">
          <h2
            id="comprasal-stages-title"
            className="font-heading text-base font-semibold text-text-primary"
          >
            Etapas reportadas
          </h2>
          <div className="mt-3 overflow-x-auto rounded-md border border-surface-border bg-surface-raised">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-surface-border bg-surface-base text-xs text-text-secondary">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Etapa</th>
                  <th className="px-4 py-2.5 font-medium">Monto</th>
                  <th className="px-4 py-2.5 font-medium">Fecha reportada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {comprasal.stages.map((stage, index) => (
                  <tr key={`${stage.name}-${stage.reportedAtLabel}-${index}`}>
                    <td className="px-4 py-3 font-medium text-text-primary">
                      {stage.name}
                    </td>
                    <td className="px-4 py-3 text-text-primary">
                      {stage.amountLabel ?? "No publicado"}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {stage.reportedAtLabel ?? "Sin fecha publicada"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {comprasal.payments.length > 0 ? (
        <section aria-labelledby="comprasal-payments-title">
          <h2
            id="comprasal-payments-title"
            className="font-heading text-base font-semibold text-text-primary"
          >
            Pagos reportados
          </h2>
          <ul className="mt-3 divide-y divide-surface-border rounded-md border border-surface-border bg-surface-raised">
            {comprasal.payments.map((payment, index) => (
              <li
                key={`${payment.name}-${payment.reportedAtLabel}-${index}`}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {payment.name}
                  </p>
                  {payment.reportedAtLabel ? (
                    <p className="mt-0.5 text-xs text-text-secondary">
                      {payment.reportedAtLabel}
                    </p>
                  ) : null}
                </div>
                {payment.amountLabel ? (
                  <span className="text-sm font-semibold text-text-primary">
                    {payment.amountLabel}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {comprasal.beneficiaries.length > 0 ? (
        <section aria-labelledby="comprasal-beneficiaries-title">
          <h2
            id="comprasal-beneficiaries-title"
            className="font-heading text-base font-semibold text-text-primary"
          >
            Beneficiarios reportados
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {comprasal.beneficiaries.map((beneficiary, index) => (
              <li
                key={`${beneficiary.name}-${beneficiary.reportedAtLabel}-${index}`}
                className="rounded-md border border-surface-border bg-surface-raised px-4 py-3"
              >
                <p className="text-sm font-medium text-text-primary">
                  {beneficiary.name}
                </p>
                {beneficiary.country || beneficiary.reportedAtLabel ? (
                  <p className="mt-1 text-xs text-text-secondary">
                    {[beneficiary.country, beneficiary.reportedAtLabel]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function HomeSearchResultDetail({
  detail,
}: {
  detail: HomeSearchResultDetailView;
}) {
  return (
    <section
      className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-1 flex-col"
      aria-labelledby="home-search-result-detail-title"
    >
      <div
        data-testid="home-search-result-detail-header"
        className="shrink-0 border-b border-surface-border bg-surface-base pb-5"
      >
        {detail.comprasal ? (
          <ComprasalResultHeader detail={detail} />
        ) : (
          <header>
            <h1
              id="home-search-result-detail-title"
              className="font-heading text-2xl font-bold leading-tight tracking-tight text-text-primary md:text-[1.75rem]"
            >
              {detail.title}
            </h1>
            <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <DetailField label="Fecha límite" value={detail.deadlineLabel} />
              <DetailField label="Monto" value={detail.amountLabel} />
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                  Sitio web
                </dt>
                <dd className="mt-1 text-sm font-semibold text-text-primary">
                  {detail.websiteUrl ? (
                    <ExternalLink
                      href={detail.websiteUrl}
                      className="break-all text-accent hover:underline"
                    >
                      {detail.websiteLabel}
                    </ExternalLink>
                  ) : (
                    <span className="text-text-secondary">
                      {detail.websiteLabel}
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          </header>
        )}
      </div>

      <div
        data-testid="home-search-result-detail-scroll"
        className="min-h-0 flex-1 overflow-y-auto pt-6 pb-8"
      >
        {detail.comprasal ? (
          <ComprasalResultBody detail={detail} />
        ) : (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
              Descripción
            </p>
            <p className="mt-1 text-sm leading-6 text-text-primary whitespace-pre-wrap">
              {detail.description}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
