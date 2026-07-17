import type { ReactNode } from "react";
import Link from "next/link";

import { ExternalLink } from "@/components/shared/external-link";
import { SkeuButton } from "@/components/ui/skeu-button";
import {
  SkeuCard,
  SkeuCardContent,
  SkeuCardHeader,
  SkeuCardTitle,
} from "@/components/ui/skeu-card";
import type { ProjectDetailField } from "@/features/projects/project-detail-fields";
import { cn } from "@/lib/utils";

function DetailFieldGrid({
  fields,
  columns = 2,
}: {
  fields: ProjectDetailField[];
  columns?: 2 | 3;
}) {
  if (fields.length === 0) {
    return null;
  }

  return (
    <dl
      className={cn(
        "grid gap-x-4 gap-y-3",
        columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
      )}
    >
      {fields.map((field) => (
        <div key={`${field.label}-${field.value}`} className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
            {field.label}
          </dt>
          <dd className="mt-0.5 wrap-break-word text-sm font-medium text-text-primary">
            {field.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ProjectDetailHighlights({
  fields,
}: {
  fields: ProjectDetailField[];
}) {
  if (fields.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border border-surface-border bg-surface-base px-4 py-3">
      <DetailFieldGrid fields={fields} columns={fields.length >= 3 ? 3 : 2} />
    </div>
  );
}

export function ProjectDetailFieldList({
  fields,
}: {
  fields: ProjectDetailField[];
}) {
  return <DetailFieldGrid fields={fields} />;
}

export function OfficialSourceCallout({
  ok,
  href,
  failureDetail,
}: {
  ok: boolean;
  href: string;
  failureDetail: string | null;
}) {
  if (ok) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-status-open/30 bg-accent-mint/50 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-status-open">
            Convocatoria oficial validada
          </p>
          <p className="mt-0.5 truncate text-xs text-text-secondary">{href}</p>
        </div>
        <SkeuButton asChild variant="outline" size="sm">
          <a href={href} target="_blank" rel="noopener noreferrer">
            Abrir fuente
          </a>
        </SkeuButton>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-status-expiring/40 bg-accent-peach/30 px-4 py-3">
      <p className="text-sm font-medium text-status-evaluating">
        Convocatoria oficial no validada
      </p>
      <p className="mt-1 text-xs text-text-secondary">
        {failureDetail ??
          "El enlace no respondió o no es seguro. No se acepta como evidencia hasta que sea una URL específica y accesible."}
      </p>
      <p className="mt-2 break-all text-xs text-text-secondary">
        URL registrada:{" "}
        <ExternalLink href={href} className="text-xs">
          {href}
        </ExternalLink>
      </p>
    </div>
  );
}

export function ProjectDetailActions({
  canConvert,
  alreadyLead,
  officialUrlOk,
  searchResultId,
  convertAction,
}: {
  canConvert: boolean;
  alreadyLead: boolean;
  officialUrlOk: boolean;
  searchResultId: string;
  convertAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-surface-border pt-4">
      {canConvert ? (
        <form action={convertAction}>
          <input type="hidden" name="searchResultId" value={searchResultId} />
          <SkeuButton
            type="submit"
            variant="primary"
            disabled={!officialUrlOk && !alreadyLead}
          >
            {alreadyLead ? "Abrir / reutilizar Lead" : "Convertir en Lead"}
          </SkeuButton>
        </form>
      ) : null}
      <SkeuButton asChild variant="outline">
        <Link href="/projects">Volver al listado</Link>
      </SkeuButton>
    </div>
  );
}

export function ProjectSummaryCard({
  highlights,
  fields,
  narrative,
  discardReason,
  officialUrlOk,
  officialHref,
  officialFailureDetail,
  children,
}: {
  highlights: ProjectDetailField[];
  fields: ProjectDetailField[];
  narrative: string | null;
  discardReason?: string | null;
  officialUrlOk: boolean;
  officialHref: string;
  officialFailureDetail: string | null;
  children?: ReactNode;
}) {
  return (
    <SkeuCard>
      <SkeuCardHeader className="border-b border-surface-border pb-4">
        <SkeuCardTitle>Resumen de la convocatoria</SkeuCardTitle>
      </SkeuCardHeader>
      <SkeuCardContent className="space-y-5">
        <ProjectDetailHighlights fields={highlights} />

        {narrative ? (
          <p className="text-sm leading-relaxed text-text-primary">{narrative}</p>
        ) : null}

        <ProjectDetailFieldList fields={fields} />

        {discardReason ? (
          <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            Motivo de descarte: {discardReason}
          </p>
        ) : null}

        <OfficialSourceCallout
          ok={officialUrlOk}
          href={officialHref}
          failureDetail={officialFailureDetail}
        />

        {children}
      </SkeuCardContent>
    </SkeuCard>
  );
}
