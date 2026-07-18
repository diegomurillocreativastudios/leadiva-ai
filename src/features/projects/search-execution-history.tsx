import Link from "next/link";

import { formatPrivateSearchOutcome } from "@/features/projects/private-search-labels";
import { searchStatusLabel } from "@/features/projects/search-activity-status";
import type { SearchExecutionListItem } from "@/features/projects/search-execution-activity";
import { cn } from "@/lib/utils";

export function SearchExecutionHistory({
  items,
  selectedId,
}: {
  items: SearchExecutionListItem[];
  selectedId: string | null;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-surface-border p-4 text-sm text-text-secondary">
        Aún no hay búsquedas privadas asociadas a tu usuario.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-surface-border">
      <table className="w-full min-w-[760px] text-left text-xs">
        <thead className="bg-surface-base text-text-secondary">
          <tr>
            <th className="px-3 py-2 font-medium">Fecha</th>
            <th className="px-3 py-2 font-medium">Fuente</th>
            <th className="px-3 py-2 font-medium">Resultado</th>
            <th className="px-3 py-2 text-right font-medium">Candidatos</th>
            <th className="px-3 py-2 text-right font-medium">Verificados</th>
            <th className="px-3 py-2 text-right font-medium">Guardados</th>
            <th className="px-3 py-2 text-right font-medium">Costo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-border">
          {items.map((item) => (
            <tr
              key={item.id}
              className={cn(
                "relative transition-colors hover:bg-surface-pressed",
                selectedId === item.id && "bg-accent-mint/55",
              )}
            >
              <td className="px-3 py-2.5 whitespace-nowrap">
                <Link
                  href={`/b/${item.id}`}
                  prefetch={false}
                  scroll={false}
                  aria-current={selectedId === item.id ? "true" : undefined}
                  className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-accent/40"
                >
                  {new Date(item.completedAt ?? item.createdAt).toLocaleString(
                    "es-SV",
                    { dateStyle: "short", timeStyle: "short" },
                  )}
                </Link>
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap">
                {item.searchProvider ?? "Grounding"}
              </td>
              <td className="max-w-56 truncate px-3 py-2.5">
                {formatPrivateSearchOutcome(item.outcome) ??
                  searchStatusLabel(item.status)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {item.summary.candidatesFound}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {item.summary.candidatesVerified}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {item.summary.saved}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {item.estimatedCost ? `$${item.estimatedCost}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
