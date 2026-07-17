"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";

import {
  bulkConvertProjectsAction,
  bulkDiscardProjectsAction,
  type ActionState,
} from "@/features/auth/actions";
import {
  ContractingSectorBadge,
  DeadlineCell,
  DuplicateBadge,
  ScoreBadge,
  SourceBadge,
  VerificationBadge,
} from "@/features/projects/project-badges";
import {
  formatCategoryLabel,
  formatProjectBudgetLabel,
} from "@/features/projects/project-detail-fields";
import { SkeuButton } from "@/components/ui/skeu-button";
import {
  SkeuCard,
  SkeuCardContent,
} from "@/components/ui/skeu-card";
import { SkeuTextarea } from "@/components/ui/skeu-input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DeadlineVigency } from "@/lib/project-catalog";
import { useActionToast } from "@/lib/use-action-toast";

const initial: ActionState = {};

export type ProjectListItem = {
  id: string;
  title: string;
  organizationName: string | null;
  sourceType: string;
  category: string | null;
  countryCode: string | null;
  externalId?: string | null;
  preliminaryScore: number | null;
  verificationStatus: string;
  publishedAt: Date | null;
  deadlineAt: Date | null;
  estimatedAmount?: string | null;
  currency?: string | null;
  amountStatus?: string | null;
  contractingSector?: string | null;
  searchExecutionId: string | null;
  vigency: DeadlineVigency;
  isExpiringSoon?: boolean;
  isPossibleDuplicate: boolean;
  duplicateReason: string | null;
};

function OpportunityPrimaryCell({ item }: { item: ProjectListItem }) {
  return (
    <div className="min-w-0">
      <Link
        href={`/projects/${item.id}`}
        prefetch={false}
        className="line-clamp-2 text-sm font-medium leading-snug text-text-primary underline-offset-2 hover:text-accent hover:underline"
      >
        {item.title}
      </Link>
      <p className="mt-0.5 text-xs leading-snug text-text-secondary">
        {item.organizationName ?? "Sin organización"}
      </p>
      {item.externalId ? (
        <p className="mt-0.5 font-mono text-[11px] text-text-secondary">
          {item.externalId}
        </p>
      ) : null}
      {item.isPossibleDuplicate ? (
        <div className="mt-1.5">
          <DuplicateBadge
            isPossibleDuplicate
            reason={item.duplicateReason}
            compact
          />
        </div>
      ) : null}
    </div>
  );
}

export function ProjectsTable({ items }: { items: ProjectListItem[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [discardState, discardAction, discardPending] = useActionState(
    bulkDiscardProjectsAction,
    initial,
  );
  const [convertState, convertAction, convertPending] = useActionState(
    bulkConvertProjectsAction,
    initial,
  );

  useActionToast(discardState, () => {
    setSelected([]);
    router.refresh();
  });
  useActionToast(convertState, () => {
    setSelected([]);
    router.refresh();
  });

  const allSelected = useMemo(
    () => items.length > 0 && selected.length === items.length,
    [items.length, selected.length],
  );

  function toggleAll() {
    setSelected(allSelected ? [] : items.map((item) => item.id));
  }

  function toggleOne(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  return (
    <div className="space-y-4">
      {selected.length > 0 ? (
        <SkeuCard>
          <SkeuCardContent className="flex flex-col gap-3 md:flex-row md:items-end">
            <p className="text-sm text-text-secondary md:flex-1">
              {selected.length} seleccionado(s)
            </p>
            <form action={convertAction} className="flex flex-wrap gap-2">
              {selected.map((id) => (
                <input key={id} type="hidden" name="searchResultIds" value={id} />
              ))}
              <SkeuButton
                type="submit"
                variant="primary"
                size="sm"
                disabled={convertPending}
              >
                {convertPending ? "Convirtiendo…" : "Convertir a Lead"}
              </SkeuButton>
            </form>
            <form
              action={discardAction}
              className="flex w-full flex-col gap-2 md:max-w-md"
            >
              {selected.map((id) => (
                <input key={id} type="hidden" name="searchResultIds" value={id} />
              ))}
              <SkeuTextarea
                name="reason"
                rows={2}
                required
                minLength={3}
                placeholder="Motivo de descarte masivo…"
                aria-label="Motivo de descarte masivo"
              />
              <SkeuButton
                type="submit"
                variant="danger"
                size="sm"
                disabled={discardPending}
              >
                {discardPending ? "Descartando…" : "Descartar selección"}
              </SkeuButton>
            </form>
          </SkeuCardContent>
        </SkeuCard>
      ) : null}

      {/* Mobile cards */}
      <ul className="space-y-3 md:hidden">
        {items.map((item) => (
          <li key={item.id}>
            <SkeuCard>
              <SkeuCardContent className="space-y-3 px-4 py-4">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected.includes(item.id)}
                    onChange={() => toggleOne(item.id)}
                    aria-label={`Seleccionar ${item.title}`}
                    className="mt-1 size-4 accent-accent"
                  />
                  <OpportunityPrimaryCell item={item} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <SourceBadge sourceType={item.sourceType} />
                  <ContractingSectorBadge
                    sector={item.contractingSector}
                    sourceType={item.sourceType}
                  />
                  {item.category ? (
                    <span className="rounded-md border border-surface-border px-2 py-0.5 text-[11px] text-text-secondary">
                      {formatCategoryLabel(item.category)}
                    </span>
                  ) : null}
                  <ScoreBadge score={item.preliminaryScore} compact />
                  <VerificationBadge status={item.verificationStatus} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="space-y-1">
                    <DeadlineCell
                      deadlineAt={item.deadlineAt}
                      vigency={item.vigency}
                      isExpiringSoon={item.isExpiringSoon}
                    />
                    <p className="text-xs tabular-nums text-text-secondary">
                      {formatProjectBudgetLabel(
                        item.estimatedAmount,
                        item.currency,
                        item.amountStatus,
                      )}
                    </p>
                  </div>
                  <SkeuButton asChild variant="outline" size="sm">
                    <Link href={`/projects/${item.id}`} prefetch={false}>
                      Revisar
                    </Link>
                  </SkeuButton>
                </div>
              </SkeuCardContent>
            </SkeuCard>
          </li>
        ))}
      </ul>

      {/* Desktop table */}
      <SkeuCard className="hidden md:block">
        <SkeuCardContent className="px-0 py-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10 px-5">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Seleccionar todos"
                    className="size-4 accent-accent"
                  />
                </TableHead>
                <TableHead className="min-w-[260px]">Oportunidad</TableHead>
                <TableHead className="w-[120px]">Fuente</TableHead>
                <TableHead className="w-[90px]">Sector</TableHead>
                <TableHead className="w-[110px]">Categoría</TableHead>
                <TableHead className="w-[110px]">Presupuesto</TableHead>
                <TableHead className="w-[90px]">Score</TableHead>
                <TableHead className="w-[110px]">Estado</TableHead>
                <TableHead className="w-[100px]">Plazo</TableHead>
                <TableHead className="w-[120px] px-5 text-right">
                  Acción
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} className="hover:bg-accent-mint/40">
                  <TableCell className="px-5 align-middle">
                    <input
                      type="checkbox"
                      checked={selected.includes(item.id)}
                      onChange={() => toggleOne(item.id)}
                      aria-label={`Seleccionar ${item.title}`}
                      className="size-4 accent-accent"
                    />
                  </TableCell>
                  <TableCell className="min-w-[240px] whitespace-normal align-middle">
                    <OpportunityPrimaryCell item={item} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-middle">
                    <SourceBadge sourceType={item.sourceType} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-middle">
                    <ContractingSectorBadge
                      sector={item.contractingSector}
                      sourceType={item.sourceType}
                    />
                  </TableCell>
                  <TableCell className="max-w-[120px] truncate align-middle text-xs text-text-secondary">
                    {item.category ? formatCategoryLabel(item.category) : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-middle text-xs tabular-nums text-text-secondary">
                    {formatProjectBudgetLabel(
                      item.estimatedAmount,
                      item.currency,
                      item.amountStatus,
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-middle">
                    <ScoreBadge score={item.preliminaryScore} compact />
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-middle">
                    <VerificationBadge status={item.verificationStatus} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-middle">
                    <DeadlineCell
                      deadlineAt={item.deadlineAt}
                      vigency={item.vigency}
                      isExpiringSoon={item.isExpiringSoon}
                    />
                  </TableCell>
                  <TableCell className="px-5 align-middle">
                    <div className="flex items-center justify-end gap-1">
                      <SkeuButton asChild variant="outline" size="sm">
                        <Link href={`/projects/${item.id}`} prefetch={false}>
                          Revisar
                        </Link>
                      </SkeuButton>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <SkeuButton
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Más acciones para ${item.title}`}
                          >
                            <MoreHorizontal />
                          </SkeuButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/projects/${item.id}`} prefetch={false}>
                              Abrir detalle
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SkeuCardContent>
      </SkeuCard>
    </div>
  );
}
