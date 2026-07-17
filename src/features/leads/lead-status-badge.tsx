import { Badge } from "@/components/ui/badge";
import {
  isOpportunityStatus,
  isTerminalOpportunityStatus,
  opportunityStatusLabels,
} from "@/lib/lead-pipeline";
import { cn } from "@/lib/utils";
import type { OpportunityStatus } from "@/server/db/schema/enums";

const statusToneClass: Record<string, string> = {
  DETECTED: "border-status-open/30 bg-accent-mint text-status-open",
  PENDING_VERIFICATION:
    "border-status-evaluating/30 bg-accent-peach/50 text-status-evaluating",
  VERIFIED: "border-status-open/30 bg-accent-aqua/40 text-status-open",
  UNDER_REVIEW:
    "border-status-evaluating/30 bg-accent-peach/50 text-status-evaluating",
  APPROVED: "border-status-won/30 bg-accent-mint text-status-won",
  PREPARING_PROPOSAL:
    "border-status-evaluating/30 bg-accent-peach/50 text-status-evaluating",
  PROPOSAL_SENT: "border-status-open/30 bg-accent-aqua/40 text-status-open",
  WON: "border-status-won/40 bg-accent-mint text-status-won",
  LOST: "border-status-lost/40 bg-status-lost/10 text-status-lost",
  DISCARDED: "border-status-lost/30 bg-status-lost/10 text-status-lost",
  DUPLICATE: "border-status-inactive/40 bg-surface-pressed text-status-inactive",
  EXPIRED: "border-status-expiring/40 bg-accent-coral/40 text-status-expiring",
};

export function LeadStatusBadge({ status }: { status: string }) {
  const label = isOpportunityStatus(status)
    ? opportunityStatusLabels[status]
    : status;

  const terminal =
    isOpportunityStatus(status) && isTerminalOpportunityStatus(status);

  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-md font-medium",
        statusToneClass[status] ??
          (terminal
            ? "border-status-inactive/40 text-status-inactive"
            : "border-surface-border bg-surface-pressed text-text-secondary"),
      )}
    >
      {label}
    </Badge>
  );
}

export function formatOpportunityStatus(status: OpportunityStatus | string) {
  return isOpportunityStatus(status)
    ? opportunityStatusLabels[status]
    : status;
}
