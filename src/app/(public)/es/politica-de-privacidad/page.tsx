import type { Metadata } from "next";

import { getPrivacyPolicy } from "@/content/privacy-policy";
import { PrivacyPolicyLayout } from "@/features/legal/privacy-policy-layout";
import { createPrivacyPolicyMetadata } from "@/features/legal/privacy-policy-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return createPrivacyPolicyMetadata("es");
}

export default function PoliticaDePrivacidadPage() {
  return <PrivacyPolicyLayout document={getPrivacyPolicy("es")} />;
}
