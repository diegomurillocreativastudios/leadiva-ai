"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { LegalLocale } from "@/config/legal";
import { cn } from "@/lib/utils";

const LANGUAGE_STORAGE_KEY = "leadiva.privacy-language";
const LANGUAGE_COOKIE_NAME = "leadiva_privacy_language";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

type LanguageSwitcherProps = {
  locale: LegalLocale;
  ariaLabel: string;
  paths: Record<LegalLocale, string>;
  className?: string;
};

function persistLanguage(locale: LegalLocale) {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, locale);
  } catch {
    // The route remains the source of truth when storage is unavailable.
  }

  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${LANGUAGE_COOKIE_NAME}=${locale}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${secure}`;
}

export function LanguageSwitcher({
  locale,
  ariaLabel,
  paths,
  className,
}: LanguageSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    document.documentElement.lang = locale === "es" ? "es-SV" : "en";
    persistLanguage(locale);
  }, [locale]);

  return (
    <div className={cn("relative inline-flex", className)}>
      <select
        aria-label={ariaLabel}
        value={locale}
        disabled={isPending}
        onChange={(event) => {
          const nextLocale = event.target.value as LegalLocale;
          persistLanguage(nextLocale);
          document.documentElement.lang =
            nextLocale === "es" ? "es-SV" : "en";
          startTransition(() => router.push(paths[nextLocale]));
        }}
        className="h-9 min-w-16 cursor-pointer appearance-none rounded-md border border-surface-border bg-surface-raised py-1 pr-7 pl-3 text-sm font-semibold text-text-primary shadow-sm outline-none transition-colors hover:border-accent focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-wait disabled:opacity-60"
      >
        <option value="es">ES</option>
        <option value="en">EN</option>
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px] text-text-secondary"
      >
        ▾
      </span>
    </div>
  );
}
