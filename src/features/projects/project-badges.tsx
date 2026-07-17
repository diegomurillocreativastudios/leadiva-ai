import { Badge } from "@/components/ui/badge";
import type { DeadlineVigency } from "@/lib/project-catalog";
import { cn } from "@/lib/utils";

const sourceLabels: Record<string, string> = {
  COMPRASAL: "COMPRASAL",
  PRIVATE_WEB: "Sector privado",
  LINKEDIN: "LinkedIn",
  MANUAL: "Manual",
};

const verificationLabels: Record<string, string> = {
  PENDING: "Pendiente",
  PARTIALLY_VERIFIED: "En revisión",
  VERIFIED: "Verificada",
  REJECTED: "Descartada",
};

const vigencyLabels: Record<DeadlineVigency, string> = {
  ACTIVE: "Vigente",
  EXPIRED: "Vencido",
  UNKNOWN: "Sin plazo",
};

function scoreTier(score: number): "Alto" | "Medio" | "Bajo" {
  if (score >= 70) {
    return "Alto";
  }
  if (score >= 40) {
    return "Medio";
  }
  return "Bajo";
}

export function SourceBadge({ sourceType }: { sourceType: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "rounded-md border-transparent",
        sourceType === "COMPRASAL"
          ? "bg-accent-aqua/50 text-text-primary"
          : "bg-accent-mint text-text-primary",
      )}
    >
      {sourceLabels[sourceType] ?? sourceType}
    </Badge>
  );
}

export function ContractingSectorBadge({
  sector,
  sourceType,
}: {
  sector: string | null | undefined;
  sourceType?: string;
}) {
  const resolved =
    sector && sector !== "UNKNOWN"
      ? sector
      : sourceType === "COMPRASAL"
        ? "PUBLIC"
        : null;

  if (!resolved) {
    return null;
  }

  const label = resolved === "PUBLIC" ? "Público" : resolved === "PRIVATE" ? "Privado" : resolved;

  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-md",
        resolved === "PUBLIC" &&
          "border-status-open/40 bg-accent-mint text-status-open",
        resolved === "PRIVATE" &&
          "border-accent/30 bg-accent-aqua/40 text-text-primary",
      )}
    >
      {label}
    </Badge>
  );
}

export function VerificationBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={status === "REJECTED" ? "destructive" : "outline"}
      className={cn(
        "rounded-md",
        status === "VERIFIED" &&
          "border-status-won/40 bg-accent-mint text-status-won",
        status === "PENDING" &&
          "border-status-evaluating/40 bg-accent-peach/50 text-status-evaluating",
        status === "PARTIALLY_VERIFIED" &&
          "border-status-open/40 bg-accent-aqua/40 text-status-open",
      )}
    >
      {verificationLabels[status] ?? status}
    </Badge>
  );
}

export function VigencyBadge({ vigency }: { vigency: DeadlineVigency }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-md",
        vigency === "ACTIVE" &&
          "border-status-open/40 bg-accent-mint text-status-open",
        vigency === "EXPIRED" &&
          "border-status-expiring/40 bg-accent-coral/40 text-status-expiring",
        vigency === "UNKNOWN" && "text-status-inactive",
      )}
    >
      {vigencyLabels[vigency]}
    </Badge>
  );
}

export function ScoreBadge({
  score,
  compact = false,
}: {
  score: number | null;
  compact?: boolean;
}) {
  if (score === null || score === undefined) {
    if (compact) {
      return (
        <span
          className="text-xs tabular-nums text-status-inactive"
          title="Score no disponible"
        >
          —
        </span>
      );
    }

    return (
      <Badge variant="ghost" className="rounded-md text-status-inactive">
        Score N/D
      </Badge>
    );
  }

  const tier = scoreTier(score);

  return (
    <Badge
      variant="outline"
      title={`Score ${score}`}
      className={cn(
        "rounded-md",
        tier === "Alto" && "border-status-won/40 bg-accent-mint text-status-won",
        tier === "Medio" &&
          "border-status-evaluating/40 bg-accent-peach/50 text-status-evaluating",
        tier === "Bajo" &&
          "border-status-lost/40 bg-status-lost/10 text-status-lost",
        compact && "text-[11px]",
      )}
    >
      {tier}
      {!compact ? ` · ${score}` : null}
    </Badge>
  );
}

export function DuplicateBadge({
  isPossibleDuplicate,
  reason,
  compact = false,
}: {
  isPossibleDuplicate: boolean;
  reason?: string | null;
  compact?: boolean;
}) {
  if (!isPossibleDuplicate) {
    return null;
  }

  return (
    <Badge
      variant="outline"
      title={reason ?? "Posible duplicado"}
      className="rounded-md border-status-evaluating/50 bg-accent-peach/50 text-status-evaluating"
    >
      {compact ? "Duplicado" : "Posible duplicado"}
    </Badge>
  );
}

export function DeadlineCell({
  deadlineAt,
  vigency,
  isExpiringSoon = false,
}: {
  deadlineAt: Date | string | null;
  vigency: DeadlineVigency;
  isExpiringSoon?: boolean;
}) {
  if (!deadlineAt) {
    return <span className="text-xs text-status-inactive">Sin plazo</span>;
  }

  const deadline =
    deadlineAt instanceof Date ? deadlineAt : new Date(deadlineAt);

  return (
    <span
      className={cn(
        "text-xs tabular-nums",
        vigency === "ACTIVE" && !isExpiringSoon && "text-status-open",
        isExpiringSoon && "font-medium text-status-expiring",
        vigency === "EXPIRED" && "font-medium text-status-expiring",
        vigency === "UNKNOWN" && "text-text-secondary",
      )}
    >
      {deadline.toLocaleDateString("es-SV")}
      {vigency === "EXPIRED" ? (
        <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide">
          Vencido
        </span>
      ) : null}
      {isExpiringSoon ? (
        <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide">
          Próximo
        </span>
      ) : null}
    </span>
  );
}
