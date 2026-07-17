import type { ComponentType } from "react";
import {
  CheckCircle2,
  ClipboardList,
  FolderKanban,
  Sparkles,
} from "lucide-react";

import {
  SkeuCard,
  SkeuCardContent,
} from "@/components/ui/skeu-card";
import type { SearchResultCatalogStats } from "@/server/services/opportunity.service";
import { cn } from "@/lib/utils";

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: number;
  hint: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <SkeuCard className="border border-surface-border shadow-none">
      <SkeuCardContent className="flex items-start justify-between gap-3 px-4 py-3.5">
        <div className="min-w-0">
          <p className="text-xs font-medium text-text-secondary">{label}</p>
          <p className="font-heading mt-1 text-2xl font-semibold tracking-tight tabular-nums text-text-primary">
            {value.toLocaleString("es-SV")}
          </p>
          <p className="mt-0.5 text-[11px] text-text-secondary">{hint}</p>
        </div>
        <div className="rounded-md bg-accent-mint p-2">
          <Icon className="size-3.5 text-accent" aria-hidden />
        </div>
      </SkeuCardContent>
    </SkeuCard>
  );
}

export function OpportunitiesMetrics({
  stats,
  className,
}: {
  stats: SearchResultCatalogStats;
  className?: string;
}) {
  return (
    <section
      aria-label="Métricas de oportunidades"
      className={cn(
        "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4",
        className,
      )}
    >
      <MetricCard
        label="Total de oportunidades"
        value={stats.total}
        hint="Total en catálogo"
        icon={FolderKanban}
      />
      <MetricCard
        label="Nuevas"
        value={stats.pending}
        hint="Sin revisar"
        icon={Sparkles}
      />
      <MetricCard
        label="Pendientes"
        value={stats.partiallyVerified}
        hint="En evaluación"
        icon={ClipboardList}
      />
      <MetricCard
        label="Convertidas"
        value={stats.verified}
        hint="En leads"
        icon={CheckCircle2}
      />
    </section>
  );
}
