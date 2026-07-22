import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { privacyPolicyPath, type LegalLocale } from "@/config/legal";

function resolveLocale(
  cookieLocale: string | undefined,
  acceptLanguage: string | null,
): LegalLocale {
  if (cookieLocale === "es" || cookieLocale === "en") {
    return cookieLocale;
  }

  const primary = acceptLanguage?.split(",")[0]?.trim().toLowerCase() ?? "";
  return primary.startsWith("es") ? "es" : "en";
}

export default async function PrivacyPolicyAliasPage() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const locale = resolveLocale(
    cookieStore.get("leadiva_privacy_language")?.value,
    headerStore.get("accept-language"),
  );

  redirect(privacyPolicyPath(locale));
}
