import type { PrivacySection } from "@/content/privacy-policy";
import { cn } from "@/lib/utils";

type PrivacyTableOfContentsProps = {
  sections: PrivacySection[];
  title: string;
  ariaLabel: string;
  className?: string;
};

export function PrivacyTableOfContents({
  sections,
  title,
  ariaLabel,
  className,
}: PrivacyTableOfContentsProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "rounded-lg border border-surface-border bg-surface-raised p-5",
        className,
      )}
    >
      <h2 className="font-heading text-sm font-semibold tracking-wide text-text-primary uppercase">
        {title}
      </h2>
      <ol className="mt-4 space-y-1.5">
        {sections.map((section, index) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className="group flex items-start gap-3 rounded-md px-2 py-1.5 text-sm leading-5 text-text-secondary outline-none transition-colors hover:bg-accent-mint/45 hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent/35"
            >
              <span
                aria-hidden="true"
                className="mt-px w-5 shrink-0 font-heading text-xs font-semibold tabular-nums text-accent"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>{section.title}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
