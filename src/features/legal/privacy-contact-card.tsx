import {
  legalConfig,
  localizedLegalValue,
  type ConfigurableLegalValue,
  type LegalLocale,
} from "@/config/legal";
import type { PrivacyPolicyDocument } from "@/content/privacy-policy";

type PrivacyContactCardProps = {
  locale: LegalLocale;
  copy: PrivacyPolicyDocument["contact"];
};

function PendingValue({
  field,
  locale,
  pendingLabel,
}: {
  field: ConfigurableLegalValue;
  locale: LegalLocale;
  pendingLabel: string;
}) {
  const resolved = localizedLegalValue(field, locale);

  return (
    <span className={resolved.pending ? "text-warning" : "text-text-primary"}>
      {resolved.value}
      {resolved.pending ? (
        <span className="ml-2 inline-flex rounded-full bg-accent-peach/55 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-text-primary uppercase">
          {pendingLabel}
        </span>
      ) : null}
    </span>
  );
}

export function PrivacyContactCard({ locale, copy }: PrivacyContactCardProps) {
  const items = [
    {
      label: copy.labels.legalEntity,
      value: (
        <PendingValue
          field={legalConfig.legalEntityName}
          locale={locale}
          pendingLabel={copy.pendingLabel}
        />
      ),
    },
    { label: copy.labels.tradeName, value: legalConfig.tradeName },
    { label: copy.labels.country, value: legalConfig.country },
    {
      label: copy.labels.address,
      value: (
        <PendingValue
          field={legalConfig.legalAddress}
          locale={locale}
          pendingLabel={copy.pendingLabel}
        />
      ),
    },
    {
      label: copy.labels.email,
      value: (
        <PendingValue
          field={legalConfig.contactEmail}
          locale={locale}
          pendingLabel={copy.pendingLabel}
        />
      ),
    },
  ];

  return (
    <aside className="mt-6 rounded-lg border border-surface-border bg-surface-raised p-5 sm:p-6">
      <h3 className="font-heading text-base font-semibold text-text-primary">
        {copy.title}
      </h3>
      <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.label} className="border-t border-surface-border pt-3">
            <dt className="text-xs font-semibold tracking-wide text-text-secondary uppercase">
              {item.label}
            </dt>
            <dd className="mt-1 text-sm leading-6 text-text-primary">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
