import Link from "next/link";

import { SkeuButton } from "@/components/ui/skeu-button";
import {
  serializeProjectFilters,
  type ProjectFiltersInput,
} from "@/schemas/projects";

export function ProjectsPagination({
  filters,
  total,
  totalPages,
}: {
  filters: ProjectFiltersInput;
  total: number;
  totalPages: number;
}) {
  const prevPage = filters.page > 1 ? filters.page - 1 : null;
  const nextPage = filters.page < totalPages ? filters.page + 1 : null;
  const from = total === 0 ? 0 : (filters.page - 1) * filters.pageSize + 1;
  const to = Math.min(filters.page * filters.pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-text-secondary">
        Mostrando {from}–{to} de {total} · Página {filters.page} de {totalPages}
      </p>
      <div className="flex gap-2">
        {prevPage ? (
          <SkeuButton asChild size="sm" variant="outline">
            <Link
              href={`/projects${serializeProjectFilters(filters, { page: prevPage })}`}
              prefetch={false}
            >
              Anterior
            </Link>
          </SkeuButton>
        ) : (
          <SkeuButton size="sm" variant="outline" disabled>
            Anterior
          </SkeuButton>
        )}
        {nextPage ? (
          <SkeuButton asChild size="sm" variant="outline">
            <Link
              href={`/projects${serializeProjectFilters(filters, { page: nextPage })}`}
              prefetch={false}
            >
              Siguiente
            </Link>
          </SkeuButton>
        ) : (
          <SkeuButton size="sm" variant="outline" disabled>
            Siguiente
          </SkeuButton>
        )}
      </div>
    </div>
  );
}
