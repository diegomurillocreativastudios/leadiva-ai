import type { RetentionCategory } from "@/config/legal";
import type { PrivacyPolicyDocument } from "@/content/privacy-policy";

const retentionOrder: RetentionCategory[] = [
  "accountInformation",
  "activeLeads",
  "closedLeads",
  "linkedinResponses",
  "oauthTokens",
  "auditLogs",
  "technicalLogs",
  "privacyRequests",
  "backups",
];

type DataRetentionTableProps = {
  copy: PrivacyPolicyDocument["retention"];
};

export function DataRetentionTable({ copy }: DataRetentionTableProps) {
  const headers = [
    copy.headers.category,
    copy.headers.justification,
    copy.headers.finalAction,
  ];

  return (
    <div className="mt-6">
      <div className="overflow-x-auto rounded-lg border border-surface-border">
        <table className="w-full min-w-2xl border-collapse bg-surface-raised text-left text-sm">
          <caption className="sr-only">{copy.caption}</caption>
          <thead className="bg-surface-pressed/80">
            <tr>
              {headers.map((header) => (
                <th
                  key={header}
                  scope="col"
                  className="border-b border-surface-border px-4 py-3 font-heading text-xs font-semibold tracking-wide text-text-primary uppercase"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {retentionOrder.map((category) => {
              const row = copy.rows[category];

              return (
                <tr key={category} className="align-top">
                  <th
                    scope="row"
                    className="w-44 px-4 py-4 font-semibold text-text-primary"
                  >
                    {row.category}
                  </th>
                  <td className="px-4 py-4 leading-6 text-text-secondary">
                    {row.justification}
                  </td>
                  <td className="px-4 py-4 leading-6 text-text-secondary">
                    {row.finalAction}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-5 text-text-secondary">
        {copy.footnote}
      </p>
    </div>
  );
}
