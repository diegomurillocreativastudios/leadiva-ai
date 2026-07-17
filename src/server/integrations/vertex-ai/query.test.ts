import { describe, expect, it } from "vitest";

import { buildDiscoverySearchPlan } from "@/server/integrations/vertex-ai/query";

describe("buildDiscoverySearchPlan", () => {
  it("creates varied SOFTWARE intents without requiring a region", () => {
    const plan = buildDiscoverySearchPlan({
      interestCategories: ["SOFTWARE"],
      maxIntents: 8,
      regionalShare: 0.25,
    });
    expect(plan.intents).toHaveLength(8);
    expect(new Set(plan.intents.map((intent) => intent.family)).size).toBeGreaterThanOrEqual(4);
    expect(plan.intents.some((intent) => intent.language === "es")).toBe(true);
    expect(plan.intents.some((intent) => intent.language === "en")).toBe(true);
    expect(plan.globalIntentCount).toBeGreaterThan(plan.regionalIntentCount);
    expect(plan.intents.filter((intent) => !intent.regional).every((intent) => !/El Salvador|Centroamérica|Latinoamérica|Latin America|LatAm/i.test(intent.query))).toBe(true);
  });

  it("covers outcomes and services beyond literal RFP/software", () => {
    const queries = buildDiscoverySearchPlan({ interestCategories: ["SOFTWARE"] }).intents
      .map((intent) => intent.query)
      .join("\n");
    expect(queries).toMatch(/seeking technology partner|looking for web development agency/i);
    expect(queries).toMatch(/website redesign vendor|managed website hosting|cloud migration/i);
  });

  it("honors the intent limit while retaining a regional complement", () => {
    const plan = buildDiscoverySearchPlan({ maxIntents: 4, regionalShare: 0.25 });
    expect(plan.intents).toHaveLength(4);
    expect(plan.intents.some((intent) => intent.regional)).toBe(true);
  });
});
