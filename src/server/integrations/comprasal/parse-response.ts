import { normalizeComprasalRecord } from "./normalize";
import {
  comprasalListResponseSchema,
  type ComprasalPageMeta,
  type ComprasalProcess,
} from "./schemas";

export type ComprasalPageResult = {
  items: ComprasalProcess[];
  meta: ComprasalPageMeta;
  invalidRows: number;
};

export function parseComprasalListResponse(
  json: unknown,
  page: number,
  perPage: number,
): ComprasalPageResult {
  const parsed = comprasalListResponseSchema.safeParse(json);

  const rows: unknown[] = parsed.success
    ? (parsed.data.data ?? (Array.isArray(json) ? json : []))
    : Array.isArray(json)
      ? json
      : [];

  let invalidRows = 0;
  const items: ComprasalProcess[] = [];

  for (const row of rows) {
    const process = normalizeComprasalRecord(row);
    if (process) {
      items.push(process);
    } else {
      invalidRows += 1;
    }
  }

  const currentPage = parsed.success
    ? (parsed.data.meta?.current_page ?? parsed.data.current_page ?? page)
    : page;
  const lastPage = parsed.success
    ? (parsed.data.meta?.last_page ?? parsed.data.last_page ?? null)
    : null;
  const total = parsed.success
    ? (parsed.data.meta?.total ?? parsed.data.total ?? null)
    : null;

  const hasMore =
    lastPage !== null ? currentPage < lastPage : items.length >= perPage;

  return {
    items,
    invalidRows,
    meta: {
      currentPage,
      lastPage,
      perPage,
      total,
      hasMore,
    },
  };
}
