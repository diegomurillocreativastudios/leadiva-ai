import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SkeuButton } from "@/components/ui/skeu-button";
import {
  SkeuCard,
  SkeuCardContent,
} from "@/components/ui/skeu-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LeadStatusBadge } from "@/features/leads/lead-status-badge";
import { LeadsFilters } from "@/features/leads/leads-filters";
import { LeadsPagination } from "@/features/leads/leads-pagination";
import { ScoreBadge } from "@/features/projects/project-badges";
import {
  buildClearedLeadFiltersQuery,
  parseLeadFilters,
} from "@/schemas/leads";
import { requireSession } from "@/server/auth/session";
import {
  listAssignableUsers,
  listOpportunities,
} from "@/server/services/opportunity.service";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();

  const params = await searchParams;
  const filters = parseLeadFilters(params);

  const [result, assignees] = await Promise.all([
    listOpportunities(filters),
    listAssignableUsers(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description="Pipeline comercial con estados, responsables y plazos."
      />

      <LeadsFilters filters={filters} assignees={assignees} />

      {result.items.length === 0 ? (
        result.catalogTotal === 0 ? (
          <EmptyState
            title="Aún no hay leads"
            description="Convierte un proyecto desde el catálogo para iniciar el pipeline."
            action={
              <SkeuButton asChild variant="primary">
                <Link href="/projects">Ir a oportunidades</Link>
              </SkeuButton>
            }
          />
        ) : (
          <EmptyState
            title="Sin leads para estos filtros"
            description="Prueba limpiar filtros o ampliar estado / responsable / plazo."
            action={
              <SkeuButton asChild variant="outline">
                <Link href={`/leads${buildClearedLeadFiltersQuery()}`}>
                  Limpiar filtros
                </Link>
              </SkeuButton>
            }
          />
        )
      ) : (
        <>
          <SkeuCard>
            <SkeuCardContent className="px-0 py-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-5">Lead</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Responsable</TableHead>
                    <TableHead className="px-5">Plazo / próxima acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.items.map((lead) => (
                    <TableRow
                      key={lead.id}
                      className="hover:bg-accent-mint/40"
                    >
                      <TableCell className="px-5">
                        <Link
                          href={`/leads/${lead.id}`}
                          className="font-medium text-text-primary underline-offset-2 hover:underline"
                        >
                          {lead.title}
                        </Link>
                        <p className="text-xs text-text-secondary">
                          {lead.organizationName} · {lead.primarySourceType}
                        </p>
                      </TableCell>
                      <TableCell>
                        <LeadStatusBadge status={lead.status} />
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <ScoreBadge score={lead.relevanceScore} compact />
                          {lead.relevanceExplanation ? (
                            <p className="max-w-[220px] truncate text-xs text-text-secondary">
                              {lead.relevanceExplanation}
                            </p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {lead.assigneeName ?? (
                          <span className="text-text-secondary">Sin asignar</span>
                        )}
                      </TableCell>
                      <TableCell className="px-5 text-sm">
                        <p>
                          {lead.deadlineAt
                            ? new Date(lead.deadlineAt).toLocaleDateString(
                                "es-SV",
                              )
                            : "Sin plazo"}
                        </p>
                        {lead.nextAction ? (
                          <p className="max-w-[220px] truncate text-xs text-text-secondary">
                            → {lead.nextAction}
                          </p>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </SkeuCardContent>
          </SkeuCard>
          <LeadsPagination
            filters={filters}
            total={result.total}
            totalPages={result.totalPages}
          />
        </>
      )}
    </div>
  );
}
