import Link from "next/link";

import { LanguageSwitcher } from "@/components/public/language-switcher";
import { LeadivaBrand } from "@/components/shared/leadiva-logo";
import type { LegalLocale } from "@/config/legal";

type PublicHeaderProps = {
  locale: LegalLocale;
  languageSelectAriaLabel: string;
  paths: Record<LegalLocale, string>;
};

export function PublicHeader({
  locale,
  languageSelectAriaLabel,
  paths,
}: PublicHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-surface-border/90 bg-surface-base/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/login"
          aria-label="Leadiva AI"
          className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <LeadivaBrand size="sm" />
        </Link>

        <LanguageSwitcher
          locale={locale}
          ariaLabel={languageSelectAriaLabel}
          paths={paths}
        />
      </div>
    </header>
  );
}
