import { describe, expect, it } from "vitest";

import {
  assertOpportunityTransition,
  canTransitionOpportunityStatus,
  getAllowedOpportunityTransitions,
  isTerminalOpportunityStatus,
} from "@/lib/lead-pipeline";

describe("lead pipeline transitions", () => {
  it("allows the happy path forward", () => {
    expect(canTransitionOpportunityStatus("DETECTED", "UNDER_REVIEW")).toBe(
      true,
    );
    expect(canTransitionOpportunityStatus("UNDER_REVIEW", "APPROVED")).toBe(
      true,
    );
    expect(canTransitionOpportunityStatus("APPROVED", "PREPARING_PROPOSAL")).toBe(
      true,
    );
    expect(
      canTransitionOpportunityStatus("PREPARING_PROPOSAL", "PROPOSAL_SENT"),
    ).toBe(true);
    expect(canTransitionOpportunityStatus("PROPOSAL_SENT", "WON")).toBe(true);
    expect(canTransitionOpportunityStatus("PROPOSAL_SENT", "LOST")).toBe(true);
  });

  it("allows exit statuses from early stages", () => {
    expect(canTransitionOpportunityStatus("DETECTED", "DISCARDED")).toBe(true);
    expect(canTransitionOpportunityStatus("DETECTED", "DUPLICATE")).toBe(true);
    expect(canTransitionOpportunityStatus("UNDER_REVIEW", "EXPIRED")).toBe(
      true,
    );
  });

  it("blocks skipping ahead and terminal reopen", () => {
    expect(canTransitionOpportunityStatus("DETECTED", "WON")).toBe(false);
    expect(canTransitionOpportunityStatus("WON", "LOST")).toBe(false);
    expect(canTransitionOpportunityStatus("DISCARDED", "UNDER_REVIEW")).toBe(
      false,
    );
    expect(canTransitionOpportunityStatus("DETECTED", "DETECTED")).toBe(false);
  });

  it("lists allowed transitions and identifies terminals", () => {
    expect(getAllowedOpportunityTransitions("PROPOSAL_SENT")).toEqual([
      "WON",
      "LOST",
      "DISCARDED",
      "EXPIRED",
    ]);
    expect(isTerminalOpportunityStatus("WON")).toBe(true);
    expect(isTerminalOpportunityStatus("APPROVED")).toBe(false);
  });

  it("throws on invalid assert", () => {
    expect(() => assertOpportunityTransition("WON", "LOST")).toThrow(
      /INVALID_TRANSITION/,
    );
  });
});
