import { opportunityStatuses, type OpportunityStatus } from "@/server/db/schema/enums";

export const terminalOpportunityStatuses = [
  "WON",
  "LOST",
  "DISCARDED",
  "EXPIRED",
  "DUPLICATE",
] as const satisfies readonly OpportunityStatus[];

export type TerminalOpportunityStatus =
  (typeof terminalOpportunityStatuses)[number];

const allowedTransitions = {
  DETECTED: ["UNDER_REVIEW", "DISCARDED", "DUPLICATE", "EXPIRED"],
  UNDER_REVIEW: ["APPROVED", "DISCARDED", "DUPLICATE", "EXPIRED"],
  APPROVED: ["PREPARING_PROPOSAL", "DISCARDED", "EXPIRED"],
  PREPARING_PROPOSAL: ["PROPOSAL_SENT", "DISCARDED", "EXPIRED"],
  PROPOSAL_SENT: ["WON", "LOST", "DISCARDED", "EXPIRED"],
  WON: [],
  LOST: [],
  DISCARDED: [],
  EXPIRED: [],
  DUPLICATE: [],
} as const satisfies Record<OpportunityStatus, readonly OpportunityStatus[]>;

export function isOpportunityStatus(value: string): value is OpportunityStatus {
  return (opportunityStatuses as readonly string[]).includes(value);
}

export function isTerminalOpportunityStatus(
  status: OpportunityStatus,
): status is TerminalOpportunityStatus {
  return (terminalOpportunityStatuses as readonly string[]).includes(status);
}

export function getAllowedOpportunityTransitions(
  from: OpportunityStatus,
): readonly OpportunityStatus[] {
  return allowedTransitions[from];
}

export function canTransitionOpportunityStatus(
  from: OpportunityStatus,
  to: OpportunityStatus,
): boolean {
  if (from === to) {
    return false;
  }
  const allowed: readonly OpportunityStatus[] = allowedTransitions[from];
  return allowed.includes(to);
}

export function assertOpportunityTransition(
  from: OpportunityStatus,
  to: OpportunityStatus,
): void {
  if (!canTransitionOpportunityStatus(from, to)) {
    throw new Error(`INVALID_TRANSITION:${from}->${to}`);
  }
}

export const opportunityStatusLabels: Record<OpportunityStatus, string> = {
  DETECTED: "Detectado",
  UNDER_REVIEW: "En revisión",
  APPROVED: "Aprobado",
  PREPARING_PROPOSAL: "Preparando propuesta",
  PROPOSAL_SENT: "Propuesta enviada",
  WON: "Ganado",
  LOST: "Perdido",
  DISCARDED: "Descartado",
  EXPIRED: "Vencido",
  DUPLICATE: "Duplicado",
};

export const leadSortOptions = [
  "updated_desc",
  "deadline_asc",
  "deadline_desc",
  "score_desc",
  "score_asc",
  "title_asc",
] as const;

export type LeadSortOption = (typeof leadSortOptions)[number];
