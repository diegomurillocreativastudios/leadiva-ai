import Link from "next/link";
import { ArrowLeft, ExternalLinkIcon, Info } from "lucide-react";

import { ExternalLink } from "@/components/shared/external-link";
import { homeSearchHref } from "@/lib/home-search-href";
import type { HomeSearchResultDetailView } from "@/lib/home-search-result-detail";

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
      <dt className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-text-primary">{value}</dd>
    </div>
  );
}

function ComprasalResultDetail({
  detail,
}: {
  detail: HomeSearchResultDetailView;
}) {
  const comprasal = detail.comprasal;
  if (!comprasal) return null;

  return (
    <div className="space-y-8">
      <header className="border-b border-surface-border pb-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-accent/25 bg-accent-mint px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent-dark">
            COMPRASAL
          </span>
          {comprasal.scoreLabel ? (
            <span className="text-xs text-text-secondary">
              Relevancia {comprasal.scoreLabel}
            </span>
          ) : null}
        </div>
        <h1
          id="home-search-result-detail-title"
          className="max-w-4xl font-heading text-xl font-semibold leading-tight text-text-primary md:text-2xl"
        >
          {detail.title}
        </h1>
        {detail.description !== "Sin descripción disponible" ? (
          <p className="mt-3 max-w-3xl text-sm leading-6 text-text-secondary whitespace-pre-wrap">
            {detail.description}
          </p>
        ) : null}

        <dl className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          <DetailField label="Código" value={comprasal.code} />
          <DetailField label="Institución" value={comprasal.institution} />
          <DetailField label="Estado" value={comprasal.processStatus} />
          <DetailField
            label="Forma de contratación"
            value={comprasal.contractingMethod}
          />
          <DetailField
            label="Fecha límite"
            value={comprasal.deadlineAtLabel}
          />
          <DetailField
            label="Fecha de publicación"
            value={comprasal.publishedAtLabel}
          />
        </dl>

        {detail.websiteUrl ? (
          <ExternalLink
            href={detail.websiteUrl}
            className="mt-6 inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent-mint px-3 py-2 text-sm no-underline hover:bg-accent-mint/70 hover:no-underline"
          >
            {detail.websiteLabel}
            <ExternalLinkIcon className="size-3.5" aria-hidden />
          </ExternalLink>
        ) : null}
      </header>

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
  executionId,
  detail,
}: {
  executionId: string;
  detail: HomeSearchResultDetailView;
}) {
  return (
    <section
      className="mx-auto flex w-full max-w-5xl flex-1 flex-col"
      aria-labelledby="home-search-result-detail-title"
    >
      <Link
        href={homeSearchHref(executionId)}
        className="mb-6 inline-flex w-fit items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-accent"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Volver a resultados
      </Link>

      {detail.comprasal ? (
        <ComprasalResultDetail detail={detail} />
      ) : (
        <dl className="space-y-6">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">
              Título
            </dt>
            <dd
              id="home-search-result-detail-title"
              className="mt-1 font-heading text-lg font-semibold text-text-primary md:text-xl"
            >
              {detail.title}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">
              Descripción
            </dt>
            <dd className="mt-1 text-sm leading-6 text-text-primary whitespace-pre-wrap">
              {detail.description}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">
              Sitio web
            </dt>
            <dd className="mt-1 text-sm">
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

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">
              Fecha límite
            </dt>
            <dd className="mt-1 text-sm font-medium text-text-primary">
              {detail.deadlineLabel}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">
              Monto
            </dt>
            <dd className="mt-1 text-sm font-medium text-text-primary">
              {detail.amountLabel}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
