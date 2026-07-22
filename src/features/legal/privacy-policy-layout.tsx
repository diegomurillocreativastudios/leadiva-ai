import Link from "next/link";
import {
  ArrowUp,
  ExternalLinkIcon,
  FileCheck2,
  TriangleAlert,
} from "lucide-react";

import { PublicHeader } from "@/components/public/public-header";
import { ExternalLink } from "@/components/shared/external-link";
import {
  legalConfig,
  localizedLegalValue,
  type LegalLocale,
} from "@/config/legal";
import type {
  PrivacyContentBlock,
  PrivacyPolicyDocument,
  PrivacySection,
} from "@/content/privacy-policy";

import { DataRetentionTable } from "./data-retention-table";
import { PrivacyContactCard } from "./privacy-contact-card";
import { PrivacyTableOfContents } from "./privacy-table-of-contents";

type PrivacyPolicyLayoutProps = {
  document: PrivacyPolicyDocument;
};

function ContentBlock({ block }: { block: PrivacyContentBlock }) {
  if (block.type === "paragraph") {
    return <p className="leading-7 text-text-secondary">{block.text}</p>;
  }

  if (block.type === "list") {
    return (
      <ul className="space-y-2.5 pl-5 text-text-secondary marker:text-accent">
        {block.items.map((item) => (
          <li key={item} className="list-disc pl-1 leading-7">
            {item}
          </li>
        ))}
      </ul>
    );
  }

  if (block.type === "subsection") {
    return (
      <div className="space-y-3 pt-2">
        <h3 className="font-heading text-lg font-semibold tracking-tight text-text-primary">
          {block.title}
        </h3>
        {block.paragraphs?.map((paragraph) => (
          <p key={paragraph} className="leading-7 text-text-secondary">
            {paragraph}
          </p>
        ))}
        {block.items ? (
          <ul className="space-y-2.5 pl-5 text-text-secondary marker:text-accent">
            {block.items.map((item) => (
              <li key={item} className="list-disc pl-1 leading-7">
                {item}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  if (block.type === "note") {
    const warning = block.tone === "warning";
    return (
      <aside
        role="note"
        className={
          warning
            ? "rounded-lg border border-accent-peach bg-accent-peach/20 p-4"
            : "rounded-lg border border-accent-aqua/70 bg-accent-aqua/15 p-4"
        }
      >
        <div className="flex gap-3">
          {warning ? (
            <TriangleAlert
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-warning"
            />
          ) : (
            <FileCheck2
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-accent-dark"
            />
          )}
          <div>
            <h3 className="font-heading text-sm font-semibold text-text-primary">
              {block.title}
            </h3>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              {block.text}
            </p>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised p-4">
      <ExternalLink
        href={block.href}
        className="inline-flex items-center gap-1.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        {block.label}
        <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
      </ExternalLink>
      <p className="mt-2 text-sm leading-6 text-text-secondary">
        {block.description}
      </p>
    </div>
  );
}

function PrivacySectionContent({
  section,
  document,
}: {
  section: PrivacySection;
  document: PrivacyPolicyDocument;
}) {
  const sectionNumber =
    document.sections.findIndex((item) => item.id === section.id) + 1;

  return (
    <section
      id={section.id}
      aria-labelledby={`${section.id}-title`}
      className="scroll-mt-24 border-t border-surface-border pt-9 first:border-t-0 first:pt-0 sm:pt-12"
    >
      <div className="grid gap-3 sm:grid-cols-[2.5rem_1fr] sm:gap-5">
        <span
          aria-hidden="true"
          className="font-heading text-sm font-semibold tabular-nums text-accent"
        >
          {String(sectionNumber).padStart(2, "0")}
        </span>
        <div className="min-w-0">
          <h2
            id={`${section.id}-title`}
            className="font-heading text-2xl font-semibold tracking-tight text-text-primary sm:text-[1.75rem]"
          >
            {section.title}
          </h2>
          <div className="mt-5 space-y-5 text-[0.975rem] sm:text-base">
            {section.blocks.map((block, index) => (
              <ContentBlock key={`${block.type}-${index}`} block={block} />
            ))}
          </div>

          {section.showRetentionTable ? (
            <DataRetentionTable copy={document.retention} />
          ) : null}

          {section.showContactCard ? (
            <PrivacyContactCard
              locale={document.locale}
              copy={document.contact}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function PrivacyPolicyLayout({ document }: PrivacyPolicyLayoutProps) {
  const lastUpdated = localizedLegalValue(
    legalConfig.lastUpdatedDate,
    document.locale,
  );
  const paths: Record<LegalLocale, string> = {
    es: legalConfig.privacyPolicyUrlEs,
    en: legalConfig.privacyPolicyUrlEn,
  };

  return (
    <div lang={document.htmlLang} className="min-h-screen bg-surface-base">
      <a
        href="#privacy-content"
        className="sr-only z-50 rounded-md bg-accent px-4 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {document.locale === "es"
          ? "Saltar al contenido principal"
          : "Skip to main content"}
      </a>

      <PublicHeader
        locale={document.locale}
        languageSelectAriaLabel={document.chrome.languageSelectAriaLabel}
        paths={paths}
      />

      <noscript>
        <div className="border-b border-surface-border bg-surface-raised px-4 py-2 text-center text-sm">
          <Link className="font-semibold text-accent underline" href={paths.es}>
            ES
          </Link>
          <span aria-hidden="true" className="px-2 text-text-secondary">
            ·
          </span>
          <Link className="font-semibold text-accent underline" href={paths.en}>
            EN
          </Link>
        </div>
      </noscript>

      <main id="privacy-content">
        <div className="mx-auto w-full max-w-7xl px-4 pt-8 pb-20 sm:px-6 sm:pt-10 lg:px-8 lg:pb-28">
          <header className="relative overflow-hidden rounded-xl border border-surface-border bg-surface-raised px-5 py-9 sm:px-10 sm:py-12 lg:px-14 lg:py-14">
            <div
              aria-hidden="true"
              className="absolute top-0 left-0 h-1.5 w-full bg-[linear-gradient(90deg,var(--color-accent-peach)_0_25%,var(--color-accent-mint)_25%_50%,var(--color-accent-aqua)_50%_75%,var(--color-accent)_75%_100%)]"
            />
            <div className="max-w-4xl">
              <p className="text-xs font-semibold tracking-[0.16em] text-accent-dark uppercase">
                {document.hero.eyebrow}
              </p>
              <h1 className="mt-4 max-w-3xl font-heading text-4xl font-semibold tracking-[-0.035em] text-text-primary sm:text-5xl lg:text-6xl">
                {document.hero.title}
              </h1>
              <p className="mt-6 max-w-3xl text-base leading-7 text-text-secondary sm:text-lg sm:leading-8">
                {document.hero.introduction}
              </p>
              <p
                className={`mt-7 text-sm ${lastUpdated.pending ? "text-warning" : "text-text-secondary"}`}
              >
                {lastUpdated.value}
              </p>
            </div>
          </header>

          <div className="mt-10 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-12 xl:gap-16">
            <PrivacyTableOfContents
              sections={document.sections}
              title={document.toc.title}
              ariaLabel={document.toc.ariaLabel}
              className="lg:sticky lg:top-24"
            />

            <article className="mt-12 min-w-0 space-y-12 lg:mt-0">
              {document.sections.map((section) => (
                <PrivacySectionContent
                  key={section.id}
                  section={section}
                  document={document}
                />
              ))}

              <div className="border-t border-surface-border pt-8 text-right">
                <a
                  href="#privacy-content"
                  className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-accent outline-none transition-colors hover:bg-accent-mint/50 focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <ArrowUp aria-hidden="true" className="size-4" />
                  {document.backToTop}
                </a>
              </div>
            </article>
          </div>
        </div>
      </main>
    </div>
  );
}
