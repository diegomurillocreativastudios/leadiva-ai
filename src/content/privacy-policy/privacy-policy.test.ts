import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  dataDeletionHref,
  legalConfig,
  legalConfigurationIssues,
  localizedLegalValue,
  privacyPolicyPath,
} from "@/config/legal";

import { privacyPolicyEn } from "./privacy-policy.en";
import { privacyPolicyEs } from "./privacy-policy.es";

function policyText(document: typeof privacyPolicyEs): string {
  return JSON.stringify(document);
}

describe("privacy policy content", () => {
  it("keeps complete, structurally equivalent Spanish and English policies", () => {
    expect(privacyPolicyEs.sections).toHaveLength(19);
    expect(privacyPolicyEn.sections).toHaveLength(19);
    expect(privacyPolicyEn.sections.map((section) => section.blocks.length)).toEqual(
      privacyPolicyEs.sections.map((section) => section.blocks.length),
    );
    expect(
      privacyPolicyEn.sections.map((section) => ({
        retention: section.showRetentionTable ?? false,
        contact: section.showContactCard ?? false,
      })),
    ).toEqual(
      privacyPolicyEs.sections.map((section) => ({
        retention: section.showRetentionTable ?? false,
        contact: section.showContactCard ?? false,
      })),
    );
  });

  it("describes current AI use without claiming LinkedIn Lead Sync is implemented", () => {
    const spanish = policyText(privacyPolicyEs);
    const english = policyText(privacyPolicyEn);

    expect(spanish).toContain("Google Cloud Vertex AI");
    expect(english).toContain("Google Cloud Vertex AI");
    expect(spanish).toContain("todavía no está implementada");
    expect(english).toContain("not yet implemented");
    expect(spanish).toContain(
      "ni código que envíe respuestas de LinkedIn Lead Gen Forms",
    );
    expect(english).toContain("no code that sends LinkedIn Lead Gen Forms responses");
  });

  it("publishes confirmed controller identity, contacts, and effective dates", () => {
    expect(legalConfig.legalEntityName.value).toBe(
      "Creativa Consultores S.A. de C.V.",
    );
    expect(legalConfig.legalAddress.value).toContain("San Salvador");
    expect(legalConfig.contactEmail.value).toBe("hi@creativastudios.us");
    expect(localizedLegalValue(legalConfig.effectiveDate, "es").value).toBe(
      "22 de julio de 2026",
    );
    expect(localizedLegalValue(legalConfig.lastUpdatedDate, "en").value).toBe(
      "July 22, 2026",
    );
    expect(legalConfigurationIssues()).not.toEqual(
      expect.arrayContaining([
        "legalEntityName",
        "legalAddress",
        "contactEmail",
        "effectiveDate",
        "lastUpdatedDate",
        "dataDeletionUrl",
      ]),
    );
    expect(policyText(privacyPolicyEs)).not.toMatch(/TODO_/);
    expect(policyText(privacyPolicyEn)).not.toMatch(/TODO_/);
    expect(policyText(privacyPolicyEs)).not.toContain("Borrador para revisión");
    expect(policyText(privacyPolicyEn)).not.toContain("Draft for review");
  });

  it("keeps retention periods pending until legal and operational confirmation", () => {
    for (const period of Object.values(legalConfig.retentionPeriods)) {
      expect(period.value).toBeNull();
      expect(localizedLegalValue(period, "es").value).toContain(
        "PENDIENTE DE DEFINICIÓN",
      );
      expect(localizedLegalValue(period, "en").value).toContain(
        "PENDING LEGAL AND OPERATIONAL DEFINITION",
      );
    }
    expect(legalConfigurationIssues()).toEqual(
      expect.arrayContaining(["retentionPeriods.accountInformation"]),
    );
  });

  it("uses localized routes and a configurable deletion mailto", () => {
    expect(privacyPolicyPath("es")).toBe("/es/politica-de-privacidad");
    expect(privacyPolicyPath("en")).toBe("/en/privacy-policy");
    expect(dataDeletionHref("es")).toBe(
      "mailto:hi@creativastudios.us?subject=Solicitud%20de%20eliminaci%C3%B3n%20de%20datos",
    );
    expect(dataDeletionHref("en")).toBe(
      "mailto:hi@creativastudios.us?subject=Request%20for%20data%20deletion",
    );
  });
});

describe("public privacy routes", () => {
  it("keeps both pages public in the application proxy", () => {
    const proxySource = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8");

    expect(proxySource).toContain('"/es/politica-de-privacidad"');
    expect(proxySource).toContain('"/en/privacy-policy"');
  });

  it("keeps the language control accessible, localized, and persistent", () => {
    const switcher = readFileSync(
      join(
        process.cwd(),
        "src/components/public/language-switcher.tsx",
      ),
      "utf8",
    );

    expect(switcher).toContain("<select");
    expect(switcher).toContain("aria-label={ariaLabel}");
    expect(switcher).toContain('<option value="es">ES</option>');
    expect(switcher).toContain('<option value="en">EN</option>');
    expect(switcher).toContain("window.localStorage.setItem");
    expect(switcher).toContain("document.cookie");
    expect(switcher).toContain("document.documentElement.lang");
    expect(switcher).toContain("router.push(paths[nextLocale])");
  });
});
