import Link from "next/link";
import { notFound } from "next/navigation";

import { ExternalLink } from "@/components/shared/external-link";
import {
  SkeuCard,
  SkeuCardContent,
  SkeuCardDescription,
  SkeuCardHeader,
  SkeuCardTitle,
} from "@/components/ui/skeu-card";
import { LeadActions } from "@/features/leads/lead-actions";
import { LeadNotes } from "@/features/leads/lead-notes";
import {
  LeadStatusBadge,
  formatOpportunityStatus,
} from "@/features/leads/lead-status-badge";
import { ScoreBadge } from "@/features/projects/project-badges";
import {
  formatCategoryLabel,
  formatProjectBudgetLabel,
} from "@/features/projects/project-detail-fields";
import { requireSession } from "@/server/auth/session";
import {
  getOpportunityDetail,
  listAssignableUsers,
} from "@/server/services/opportunity.service";
import { validateSourceUrl } from "@/server/services/source-url-validation";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();

  const { id } = await params;
  const [lead, assignees] = await Promise.all([
    getOpportunityDetail(id),
    listAssignableUsers(),
  ]);

  if (!lead) {
    notFound();
  }

  const sourceValidations = await Promise.all(
    lead.sources.map(async (source) => ({
      source,
      validation: await validateSourceUrl(source.url),
    })),
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href="/leads"
          className="text-sm text-text-secondary underline-offset-2 hover:underline"
        >
          ← Leads
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-text-primary">
            {lead.title}
          </h1>
          <LeadStatusBadge status={lead.status} />
          <ScoreBadge score={lead.relevanceScore} />
        </div>
        <p className="text-sm text-text-secondary">
          {lead.organization.name} · {lead.primarySourceType}
          {lead.assignee ? ` · ${lead.assignee.name}` : " · Sin responsable"}
        </p>
      </div>

      <SkeuCard>
        <SkeuCardHeader>
          <SkeuCardTitle>Compatibilidad Creativa</SkeuCardTitle>
          <SkeuCardDescription>
            El score de IA siempre debe ir acompañado de una explicación.
          </SkeuCardDescription>
        </SkeuCardHeader>
        <SkeuCardContent className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <ScoreBadge score={lead.relevanceScore} />
            <span className="text-text-secondary">
              {lead.relevanceScore === null
                ? "Sin score todavía"
                : `Puntaje ${lead.relevanceScore}/100`}
            </span>
          </div>
          <p className="rounded-md border border-surface-border bg-surface-base p-3">
            {lead.relevanceExplanation?.trim() ||
              "Sin explicación de compatibilidad registrada. No trates el score como hecho confirmado sin fuente."}
          </p>
        </SkeuCardContent>
      </SkeuCard>

      <SkeuCard>
        <SkeuCardHeader>
          <SkeuCardTitle>Resumen</SkeuCardTitle>
        </SkeuCardHeader>
        <SkeuCardContent className="space-y-3 text-sm">
          <p>{lead.description ?? "Sin descripción."}</p>
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-text-secondary">Organización</dt>
              <dd>{lead.organization.name}</dd>
            </div>
            <div>
              <dt className="text-text-secondary">Responsable</dt>
              <dd>{lead.assignee?.name ?? "Sin asignar"}</dd>
            </div>
            <div>
              <dt className="text-text-secondary">Próxima acción</dt>
              <dd>{lead.nextAction ?? "N/D"}</dd>
            </div>
            <div>
              <dt className="text-text-secondary">Fecha próxima acción</dt>
              <dd>
                {lead.nextActionAt
                  ? new Date(lead.nextActionAt).toLocaleString("es-SV")
                  : "N/D"}
              </dd>
            </div>
            <div>
              <dt className="text-text-secondary">Deadline</dt>
              <dd>
                {lead.deadlineAt
                  ? new Date(lead.deadlineAt).toLocaleString("es-SV")
                  : "N/D"}
              </dd>
            </div>
            <div>
              <dt className="text-text-secondary">Categoría</dt>
              <dd>
                {lead.category
                  ? formatCategoryLabel(lead.category)
                  : "N/D"}
              </dd>
            </div>
            <div>
              <dt className="text-text-secondary">Monto estimado</dt>
              <dd>
                {formatProjectBudgetLabel(
                  lead.estimatedAmount,
                  lead.currency,
                )}
              </dd>
            </div>
            <div>
              <dt className="text-text-secondary">Ubicación</dt>
              <dd>
                {[lead.city, lead.adminArea, lead.countryCode]
                  .filter(Boolean)
                  .join(", ") || "N/D"}
              </dd>
            </div>
            <div>
              <dt className="text-text-secondary">Modalidad</dt>
              <dd>{lead.workMode}</dd>
            </div>
          </dl>
        </SkeuCardContent>
      </SkeuCard>

      <SkeuCard>
        <SkeuCardHeader>
          <SkeuCardTitle>Fuentes evidenciales</SkeuCardTitle>
        </SkeuCardHeader>
        <SkeuCardContent className="space-y-2 text-sm">
          {sourceValidations.length === 0 ? (
            <p className="text-text-secondary">Sin fuentes registradas.</p>
          ) : (
            sourceValidations.map(({ source, validation }) => (
              <div key={source.id}>
                {validation.ok ? (
                  <ExternalLink href={validation.finalUrl}>
                    {source.title ?? validation.finalUrl}
                  </ExternalLink>
                ) : (
                  <span className="font-medium text-text-primary">
                    {source.title ?? source.url}
                  </span>
                )}
                <span className="ml-2 text-text-secondary">
                  ({source.sourceType}
                  {validation.ok && source.isOfficial ? " · oficial" : ""}
                  {source.isPrimary ? " · primaria" : ""}
                  {!validation.ok ? " · enlace no validado" : ""})
                </span>
                {!validation.ok ? (
                  <p className="mt-1 text-xs text-status-evaluating">
                    {validation.detail}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </SkeuCardContent>
      </SkeuCard>

      <LeadActions
        opportunityId={lead.id}
        currentStatus={lead.status}
        assignedToUserId={lead.assignedToUserId}
        nextAction={lead.nextAction}
        nextActionAt={lead.nextActionAt}
        deadlineAt={lead.deadlineAt}
        estimatedAmount={lead.estimatedAmount}
        currency={lead.currency}
        assignees={assignees}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <LeadNotes opportunityId={lead.id} notes={lead.notes} />
        <SkeuCard>
          <SkeuCardHeader>
            <SkeuCardTitle>Historial de estado</SkeuCardTitle>
          </SkeuCardHeader>
          <SkeuCardContent className="space-y-3 text-sm">
            {lead.history.length === 0 ? (
              <p className="text-text-secondary">Sin historial.</p>
            ) : (
              lead.history.map((item) => (
                <div
                  key={item.id}
                  className="rounded-md border border-surface-border bg-surface-raised px-3 py-2"
                >
                  <p>
                    {item.previousStatus
                      ? formatOpportunityStatus(item.previousStatus)
                      : "—"}{" "}
                    →{" "}
                    <strong>{formatOpportunityStatus(item.newStatus)}</strong>
                  </p>
                  <p className="text-xs text-text-secondary">
                    {new Date(item.changedAt).toLocaleString("es-SV")}
                    {item.changedByName ? ` · ${item.changedByName}` : ""}
                    {item.reason ? ` · ${item.reason}` : ""}
                  </p>
                </div>
              ))
            )}
          </SkeuCardContent>
        </SkeuCard>
      </div>
    </div>
  );
}
