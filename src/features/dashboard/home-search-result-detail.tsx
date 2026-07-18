import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { ExternalLink } from "@/components/shared/external-link";
import { homeSearchHref } from "@/lib/home-search-href";
import type { HomeSearchResultDetailView } from "@/lib/home-search-result-detail";

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
              <span className="text-text-secondary">{detail.websiteLabel}</span>
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
    </section>
  );
}
