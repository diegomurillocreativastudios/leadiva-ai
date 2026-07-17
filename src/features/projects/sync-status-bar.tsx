import Link from "next/link";
import { Activity } from "lucide-react";

import { SkeuButton } from "@/components/ui/skeu-button";
import { formatPrivateSearchOutcome } from "@/features/projects/private-search-labels";
import { searchActivityHref } from "@/features/projects/search-activity-trigger";
import {
  SearchStatusIcon,
  searchStatusLabel,
} from "@/features/projects/search-activity-status";
import { formatRelativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

type SyncSnapshot = {
  id?: string;
  status: string;
  profileName: string;
  queriesExecuted: number;
  candidatesFound: number;
  candidatesDiscarded: number;
  metrics: Record<string, unknown> | null;
  errorMessage: string | null;
  completedAt: Date | null;
  startedAt: Date | null;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: string | null;
};

function SyncChip({ label, sync }: { label: string; sync: SyncSnapshot | null }) {
  if (!sync) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
        <span className="size-1.5 rounded-full bg-status-inactive" aria-hidden />
        {label} · Sin ejecuciones
      </span>
    );
  }

  const when = sync.completedAt ?? sync.startedAt;
  const relative = formatRelativeTime(when);
  const metrics = sync.metrics ?? {};
  const outcome =
    typeof metrics.outcome === "string" ? metrics.outcome : null;
  const outcomeLabel = formatPrivateSearchOutcome(outcome);

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-sm text-text-primary">
      <SearchStatusIcon status={sync.status} />
      <span className="font-medium">{label}</span>
      <span className="text-text-secondary">
        {relative ? `actualizado ${relative}` : "sin fecha"}
        {" · "}
        {outcomeLabel ?? searchStatusLabel(sync.status)}
      </span>
    </span>
  );
}

export function SyncStatusBar({
  comprasal,
  privateSearch,
}: {
  comprasal: SyncSnapshot | null;
  privateSearch: SyncSnapshot | null;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-md border border-surface-border bg-surface-raised px-4 py-3",
        "sm:flex-row sm:items-center sm:justify-between",
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1">
        <SyncChip label="COMPRASAL" sync={comprasal} />
        <span className="hidden text-surface-border sm:inline" aria-hidden>
          ·
        </span>
        <SyncChip label="Sector privado" sync={privateSearch} />
      </div>
      <SkeuButton
        asChild
        variant="ghost"
        size="sm"
        className="self-start sm:self-auto"
      >
        <Link href={searchActivityHref(privateSearch?.id)} prefetch={false}>
          <Activity className="size-3.5" aria-hidden />
          Ver actividad
        </Link>
      </SkeuButton>
    </div>
  );
}
