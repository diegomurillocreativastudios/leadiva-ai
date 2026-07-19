import "server-only";

import type { SearchExecutionDetail } from "@/features/projects/search-execution-activity";
import {
  compareComprasalClosingDeadlineDesc,
  preferComprasalClosingDeadline,
} from "@/lib/comprasal-list-deadline";
import { loadComprasalClosingDatesByProcessIds } from "@/server/integrations/comprasal/award-report-closing-dates";

export function processIdFromComprasalPublicUrl(
  url: string | null | undefined,
): number | null {
  if (!url) {
    return null;
  }

  const match = /\/procesos-publicos\/([1-9]\d*)(?:[/?#]|$)/.exec(url);
  if (!match) {
    return null;
  }

  const processId = Number(match[1]);
  return Number.isSafeInteger(processId) && processId > 0 ? processId : null;
}

/** Replaces list deadlines with award-report fecha_cierre when available. */
export async function enrichComprasalListDeadlines(
  detail: SearchExecutionDetail,
): Promise<SearchExecutionDetail> {
  if (detail.execution.sourceType !== "COMPRASAL") {
    return detail;
  }

  const processIds = detail.candidates.flatMap((candidate) => {
    const processId = processIdFromComprasalPublicUrl(
      candidate.officialSourceUrl,
    );
    return processId === null ? [] : [processId];
  });

  const closesAtByProcessId =
    processIds.length === 0
      ? new Map<number, string>()
      : await loadComprasalClosingDatesByProcessIds(processIds);

  const candidates = detail.candidates
    .map((candidate) => {
      const processId = processIdFromComprasalPublicUrl(
        candidate.officialSourceUrl,
      );
      const closesAt =
        processId === null
          ? null
          : (closesAtByProcessId.get(processId) ?? null);

      return {
        ...candidate,
        deadlineAt: preferComprasalClosingDeadline({
          closesAt,
          deadlineAt: candidate.deadlineAt,
        }),
      };
    })
    .sort(
      (left, right) =>
        compareComprasalClosingDeadlineDesc(
          left.deadlineAt,
          right.deadlineAt,
        ) ||
        (left.title ?? "").localeCompare(right.title ?? "") ||
        (left.searchResultId ?? left.temporaryId).localeCompare(
          right.searchResultId ?? right.temporaryId,
        ),
    );

  return {
    ...detail,
    candidates,
  };
}
