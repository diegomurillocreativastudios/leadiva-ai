import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import {
  CalendarClock,
  ClipboardList,
  FolderKanban,
  Sparkles,
  Target,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SkeuButton } from "@/components/ui/skeu-button";
import {
  SkeuCard,
  SkeuCardContent,
  SkeuCardHeader,
  SkeuCardTitle,
} from "@/components/ui/skeu-card";
import { LeadStatusBadge } from "@/features/leads/lead-status-badge";
import { cn } from "@/lib/utils";

type DeadlineItem = {
  id: string;
  title: string;
  deadlineAt: Date | null;
  status: string;
  organizationName: string;
};

type RecentLeadItem = {
  id: string;
  title: string;
  status: string;
  updatedAt: Date;
  organizationName: string;
};

export type HomeDashboardSummary = {
  pendingProjects: number;
  totalLeads: number;
  leadsInReview: number;
  leadsWon: number;
  upcomingDeadlines: DeadlineItem[];
  recentLeads: RecentLeadItem[];
};

function formatShortDate(value: Date) {
  return value.toLocaleDateString("es-SV", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  iconTone = "accent",
  accentEdge = false,
  valueClassName,
  progress,
}: {
  label: string;
  value: number;
  hint: ReactNode;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  iconTone?: "accent" | "danger";
  accentEdge?: boolean;
  valueClassName?: string;
  progress?: number;
}) {
  return (
    <SkeuCard
      className={cn(
        "flex h-32 flex-col justify-between",
        accentEdge && "border-l-4 border-l-accent",
      )}
    >
      <SkeuCardHeader className="flex flex-row items-start justify-between space-y-0 px-5 pt-5 pb-0">
        <p className="text-xs font-medium tracking-wide text-text-secondary uppercase">
          {label}
        </p>
        <div
          className={cn(
            "rounded-md p-2",
            iconTone === "danger" ? "bg-danger/10" : "bg-accent-mint",
          )}
        >
          <Icon
            className={cn(
              "size-4",
              iconTone === "danger" ? "text-danger" : "text-accent",
            )}
            aria-hidden
          />
        </div>
      </SkeuCardHeader>
      <SkeuCardContent className="px-5 pt-0 pb-5">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p
              className={cn(
                "font-heading text-3xl font-semibold tracking-tight tabular-nums text-text-primary",
                valueClassName,
              )}
            >
              {value.toLocaleString("es-SV")}
            </p>
            <div className="mt-1 text-[10px] font-medium text-text-secondary">
              {hint}
            </div>
          </div>
          {typeof progress === "number" ? (
            <div
              className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-pressed"
              aria-hidden
            >
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
              />
            </div>
          ) : null}
        </div>
      </SkeuCardContent>
    </SkeuCard>
  );
}

export function HomeDashboard({
  userFirstName,
  summary,
}: {
  userFirstName: string;
  summary: HomeDashboardSummary;
}) {
  const reviewRatio =
    summary.totalLeads > 0
      ? Math.round((summary.leadsInReview / summary.totalLeads) * 100)
      : 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Resumen"
        description={`Vista general de tus operaciones comerciales${
          userFirstName ? ` · Hola, ${userFirstName}` : ""
        }`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SkeuButton asChild variant="default" size="sm">
              <Link href="/leads">Ver leads</Link>
            </SkeuButton>
            <SkeuButton asChild variant="primary" size="sm">
              <Link href="/projects">Ver oportunidades</Link>
            </SkeuButton>
          </div>
        }
      />

      <section
        aria-label="Indicadores"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-6"
      >
        <MetricCard
          label="Leads activos"
          value={summary.totalLeads}
          hint={
            <span className="inline-flex items-center gap-1 font-semibold text-success">
              <Target className="size-3" aria-hidden />
              En pipeline
            </span>
          }
          icon={Target}
        />
        <MetricCard
          label="Oportunidades nuevas"
          value={summary.pendingProjects}
          hint="Pendientes de revisar"
          icon={FolderKanban}
        />
        <MetricCard
          label="Deadlines próximos"
          value={summary.upcomingDeadlines.length}
          hint={
            summary.upcomingDeadlines.length > 0 ? (
              <span className="inline-flex rounded-full bg-danger/10 px-2 py-0.5 font-bold text-danger">
                Urgente · 7 días
              </span>
            ) : (
              "Sin plazos esta semana"
            )
          }
          icon={CalendarClock}
          iconTone="danger"
        />
        <MetricCard
          label="En revisión"
          value={summary.leadsInReview}
          hint={`Ganados: ${summary.leadsWon.toLocaleString("es-SV")}`}
          icon={Sparkles}
          accentEdge
          valueClassName="text-accent"
          progress={reviewRatio}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-3 lg:gap-8">
        <SkeuCard className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
            <SkeuCardTitle className="flex items-center gap-2 text-lg">
              <ClipboardList className="size-5 text-accent" aria-hidden />
              Próximos vencimientos
            </SkeuCardTitle>
            <Link
              href="/leads"
              className="text-xs font-bold text-accent underline-offset-2 hover:underline"
            >
              Ver todo
            </Link>
          </div>
          <SkeuCardContent className="px-0 py-0">
            {summary.upcomingDeadlines.length === 0 ? (
              <p className="px-5 py-6 text-sm text-text-secondary">
                No hay plazos en los próximos 7 días.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="border-b border-surface-border bg-accent-mint/60 text-[10px] font-bold tracking-widest text-text-secondary uppercase">
                    <tr>
                      <th className="px-5 py-3 font-bold">Lead</th>
                      <th className="px-5 py-3 font-bold">Organización</th>
                      <th className="px-5 py-3 font-bold">Fecha</th>
                      <th className="px-5 py-3 text-right font-bold">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {summary.upcomingDeadlines.map((item) => (
                      <tr
                        key={item.id}
                        className="group transition-colors duration-150 even:bg-surface-base hover:bg-accent-mint/40"
                      >
                        <td className="px-5 py-3.5">
                          <Link
                            href={`/leads/${item.id}`}
                            className="block min-w-0"
                          >
                            <p className="truncate text-sm font-semibold text-text-primary transition-colors group-hover:text-accent">
                              {item.title}
                            </p>
                          </Link>
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="max-w-[180px] truncate text-sm text-text-secondary">
                            {item.organizationName}
                          </p>
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <p className="text-sm text-text-secondary">
                            {item.deadlineAt
                              ? formatShortDate(new Date(item.deadlineAt))
                              : "—"}
                          </p>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <LeadStatusBadge status={item.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SkeuCardContent>
        </SkeuCard>

        <SkeuCard>
          <SkeuCardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-surface-border px-5 py-4">
            <SkeuCardTitle className="flex items-center gap-2 text-lg">
              <CalendarClock className="size-5 text-accent" aria-hidden />
              Actividad reciente
            </SkeuCardTitle>
          </SkeuCardHeader>
          <SkeuCardContent className="px-5 py-5">
            {summary.recentLeads.length === 0 ? (
              <div className="flex flex-col items-start gap-3 py-2">
                <p className="text-sm font-medium text-text-primary">
                  Sin leads todavía
                </p>
                <p className="text-xs text-text-secondary">
                  Convierte un proyecto del catálogo para empezar el
                  seguimiento.
                </p>
                <SkeuButton asChild size="sm" variant="primary">
                  <Link href="/projects">Ir a oportunidades</Link>
                </SkeuButton>
              </div>
            ) : (
              <ol className="relative space-y-5 border-l border-black/10 pl-5">
                {summary.recentLeads.map((item, index) => (
                  <li key={item.id} className="relative">
                    <span
                      className={cn(
                        "absolute top-1.5 left-[-1.375rem] size-2.5 rounded-full border-2 border-surface-raised",
                        index === 0 ? "bg-accent" : "bg-surface-pressed",
                      )}
                      aria-hidden
                    />
                    <Link href={`/leads/${item.id}`} className="block space-y-1">
                      <p className="text-sm font-semibold text-text-primary hover:text-accent">
                        {item.title}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {item.organizationName}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        <LeadStatusBadge status={item.status} />
                        <span className="text-[11px] text-text-secondary">
                          {formatShortDate(new Date(item.updatedAt))}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </SkeuCardContent>
          {summary.recentLeads.length > 0 ? (
            <div className="border-t border-surface-border px-5 py-4">
              <SkeuButton asChild variant="default" className="w-full">
                <Link href="/leads">Ver todo el historial</Link>
              </SkeuButton>
            </div>
          ) : null}
        </SkeuCard>
      </section>
    </div>
  );
}
