"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { Filter, RotateCcw, Search, X } from "lucide-react";

import { SkeuButton } from "@/components/ui/skeu-button";
import { SkeuInput } from "@/components/ui/skeu-input";
import { sourceTypeLabels, workModeLabels } from "@/lib/filters/labels";
import {
  deadlinePresetLabels,
  deadlinePresets,
  scorePresetLabels,
  scorePresets,
  scoreRangeForPreset,
  type ScorePreset,
} from "@/lib/filters/presets";
import {
  detectSourceGroup,
  sourceGroupIds,
  sourceGroupLabels,
  sourceTypesForGroup,
} from "@/lib/filters/source-groups";
import {
  leadSortOptions,
  opportunityStatusLabels,
} from "@/lib/lead-pipeline";
import {
  buildClearedLeadFiltersQuery,
  buildDefaultLeadFiltersQuery,
  serializeLeadFilters,
  type LeadFiltersInput,
} from "@/schemas/leads";
import {
  opportunityStatuses,
  projectCategories,
  sourceTypes,
  workModes,
} from "@/server/db/schema/enums";

const selectClassName =
  "h-10 w-full rounded-md border border-surface-border bg-surface-raised px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40";

const checkboxRowClassName =
  "flex items-center gap-2 rounded-md px-1 py-1 text-sm text-text-primary hover:bg-surface-pressed";

const sortLabels: Record<(typeof leadSortOptions)[number], string> = {
  updated_desc: "Actualizado · reciente",
  deadline_asc: "Plazo · próximo",
  deadline_desc: "Plazo · lejano",
  score_desc: "Score · alto",
  score_asc: "Score · bajo",
  title_asc: "Título · A-Z",
};

function toggleValue<T extends string>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

type Chip = { key: string; label: string; href: string };

function buildLeadChips(
  filters: LeadFiltersInput,
  assignees: Array<{ id: string; firstName: string; lastName: string }>,
): Chip[] {
  const chips: Chip[] = [];
  const base = (patch: Partial<LeadFiltersInput>) =>
    `/leads${serializeLeadFilters(filters, { ...patch, page: 1 })}`;

  if (filters.q) {
    chips.push({
      key: "q",
      label: `“${filters.q}”`,
      href: base({ q: undefined }),
    });
  }
  for (const status of filters.statuses) {
    chips.push({
      key: `status-${status}`,
      label: opportunityStatusLabels[status],
      href: base({
        statuses: filters.statuses.filter((item) => item !== status),
      }),
    });
  }
  for (const source of filters.sourceTypes) {
    chips.push({
      key: `source-${source}`,
      label: sourceTypeLabels[source] ?? source,
      href: base({
        sourceTypes: filters.sourceTypes.filter((item) => item !== source),
      }),
    });
  }
  if (filters.unassignedOnly) {
    chips.push({
      key: "unassigned",
      label: "Sin responsable",
      href: base({ unassignedOnly: false, assignedToUserIds: [] }),
    });
  } else {
    for (const userId of filters.assignedToUserIds) {
      const user = assignees.find((item) => item.id === userId);
      chips.push({
        key: `assignee-${userId}`,
        label: user
          ? `${user.firstName} ${user.lastName}`
          : "Responsable",
        href: base({
          assignedToUserIds: filters.assignedToUserIds.filter(
            (item) => item !== userId,
          ),
        }),
      });
    }
  }
  for (const category of filters.categories) {
    chips.push({
      key: `cat-${category}`,
      label: category,
      href: base({
        categories: filters.categories.filter((item) => item !== category),
      }),
    });
  }
  for (const code of filters.countryCodes) {
    chips.push({
      key: `country-${code}`,
      label: code,
      href: base({
        countryCodes: filters.countryCodes.filter((item) => item !== code),
      }),
    });
  }
  for (const mode of filters.workModes) {
    chips.push({
      key: `mode-${mode}`,
      label: workModeLabels[mode],
      href: base({
        workModes: filters.workModes.filter((item) => item !== mode),
      }),
    });
  }
  if (filters.organization) {
    chips.push({
      key: "org",
      label: filters.organization,
      href: base({ organization: undefined }),
    });
  }
  if (filters.deadlinePreset !== "ANY" || filters.noDeadline) {
    chips.push({
      key: "deadline",
      label: filters.noDeadline
        ? "Sin plazo"
        : deadlinePresetLabels[filters.deadlinePreset],
      href: base({
        deadlinePreset: "ANY",
        noDeadline: false,
        deadlineFrom: undefined,
        deadlineTo: undefined,
      }),
    });
  }
  if (filters.minScore !== undefined || filters.maxScore !== undefined) {
    const label =
      filters.minScore !== undefined && filters.maxScore !== undefined
        ? `Score ${filters.minScore}–${filters.maxScore}`
        : filters.minScore !== undefined
          ? `Score ≥ ${filters.minScore}`
          : `Score ≤ ${filters.maxScore}`;
    chips.push({
      key: "score",
      label,
      href: base({ minScore: undefined, maxScore: undefined }),
    });
  }
  return chips;
}

export function LeadsFilters({
  filters,
  assignees,
}: {
  filters: LeadFiltersInput;
  assignees: Array<{ id: string; firstName: string; lastName: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [panelOpen, setPanelOpen] = useState(false);
  const panelId = useId();
  const [draft, setDraft] = useState(filters);
  const [scorePreset, setScorePreset] = useState<ScorePreset>(() => {
    if (filters.minScore === undefined && filters.maxScore === undefined) {
      return "ANY";
    }
    return "CUSTOM";
  });

  const chips = useMemo(
    () => buildLeadChips(filters, assignees),
    [filters, assignees],
  );

  function openPanel() {
    setDraft(filters);
    setScorePreset(
      filters.minScore === undefined && filters.maxScore === undefined
        ? "ANY"
        : "CUSTOM",
    );
    setPanelOpen(true);
  }

  useEffect(() => {
    if (!panelOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPanelOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [panelOpen]);

  function navigate(query: string) {
    startTransition(() => {
      router.push(`/leads${query}`);
      setPanelOpen(false);
    });
  }

  function applyDraft(next: LeadFiltersInput = draft) {
    navigate(serializeLeadFilters({ ...next, cleared: false, page: 1 }));
  }

  return (
    <div className="space-y-3">
      <form
        className="flex flex-col gap-2 lg:flex-row lg:items-center"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          applyDraft({
            ...draft,
            q: String(formData.get("q") ?? "") || undefined,
            sort:
              (String(formData.get("sort") ?? draft.sort) as typeof draft.sort) ||
              draft.sort,
          });
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-secondary"
            aria-hidden
          />
          <SkeuInput
            name="q"
            placeholder="Buscar título u organización"
            defaultValue={filters.q ?? ""}
            aria-label="Buscar"
            className="h-10 pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <SkeuButton
            type="button"
            variant="outline"
            size="sm"
            className="h-10"
            aria-expanded={panelOpen}
            aria-controls={panelId}
            onClick={openPanel}
          >
            <Filter className="size-3.5" aria-hidden />
            Más filtros
            {chips.length > 0 ? (
              <span className="rounded-md bg-accent-mint px-1.5 text-[10px] font-semibold text-accent">
                {chips.length}
              </span>
            ) : null}
          </SkeuButton>
          <select
            name="sort"
            defaultValue={filters.sort}
            aria-label="Ordenar por"
            className={`${selectClassName} h-10 w-full sm:w-48`}
            onChange={(event) => {
              applyDraft({
                ...draft,
                sort: event.target.value as LeadFiltersInput["sort"],
                q: filters.q,
              });
            }}
          >
            {leadSortOptions.map((sort) => (
              <option key={sort} value={sort}>
                {sortLabels[sort]}
              </option>
            ))}
          </select>
          <SkeuButton type="submit" variant="primary" size="sm" className="h-10" disabled={pending}>
            {pending ? "Buscando…" : "Buscar"}
          </SkeuButton>
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
        {sourceGroupIds.map((group) => {
          const selected =
            group === "ALL"
              ? filters.sourceTypes.length === 0
              : detectSourceGroup(filters.sourceTypes) === group;
          return (
            <button
              key={group}
              type="button"
              className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                selected
                  ? "border-accent bg-accent-mint text-accent"
                  : "border-surface-border bg-surface-raised text-text-primary hover:bg-surface-pressed"
              }`}
              onClick={() => {
                navigate(
                  serializeLeadFilters(filters, {
                    sourceTypes: sourceTypesForGroup(group),
                    page: 1,
                  }),
                );
              }}
            >
              {sourceGroupLabels[group]}
            </button>
          );
        })}
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <Link
              key={chip.key}
              href={chip.href}
              prefetch={false}
              className="inline-flex items-center gap-1 rounded-md border border-surface-border bg-surface-raised px-2 py-1 text-xs text-text-primary hover:bg-surface-pressed"
            >
              {chip.label}
              <X className="size-3 text-text-secondary" aria-hidden />
            </Link>
          ))}
          <button
            type="button"
            className="text-xs font-medium text-accent underline-offset-2 hover:underline"
            onClick={() => navigate(buildClearedLeadFiltersQuery())}
          >
            Limpiar filtros
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary underline-offset-2 hover:underline"
            onClick={() => navigate(buildDefaultLeadFiltersQuery())}
          >
            <RotateCcw className="size-3" aria-hidden />
            Restaurar predeterminados
          </button>
        </div>
      ) : null}

      {panelOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            aria-label="Cerrar filtros"
            className="absolute inset-0 bg-text-primary/25"
            onClick={() => setPanelOpen(false)}
          />
          <aside
            id={panelId}
            role="dialog"
            aria-modal="true"
            className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-surface-border bg-surface-raised shadow-md"
          >
            <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
              <h2 className="font-heading text-base font-semibold">Más filtros</h2>
              <SkeuButton type="button" variant="ghost" size="icon-sm" onClick={() => setPanelOpen(false)}>
                <X />
              </SkeuButton>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Estados</legend>
                <div className="grid max-h-40 grid-cols-1 gap-1 overflow-y-auto">
                  {opportunityStatuses.map((status) => (
                    <label key={status} className={checkboxRowClassName}>
                      <input
                        type="checkbox"
                        checked={draft.statuses.includes(status)}
                        onChange={() =>
                          setDraft((current) => ({
                            ...current,
                            statuses: toggleValue(current.statuses, status),
                          }))
                        }
                      />
                      {opportunityStatusLabels[status]}
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Fuentes</legend>
                <div className="grid grid-cols-2 gap-1">
                  {sourceTypes.map((source) => (
                    <label key={source} className={checkboxRowClassName}>
                      <input
                        type="checkbox"
                        checked={draft.sourceTypes.includes(source)}
                        onChange={() =>
                          setDraft((current) => ({
                            ...current,
                            sourceTypes: toggleValue(current.sourceTypes, source),
                          }))
                        }
                      />
                      {sourceTypeLabels[source]}
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Responsables</legend>
                <label className={checkboxRowClassName}>
                  <input
                    type="checkbox"
                    checked={draft.unassignedOnly}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        unassignedOnly: event.target.checked,
                        assignedToUserIds: event.target.checked
                          ? []
                          : current.assignedToUserIds,
                      }))
                    }
                  />
                  Sin responsable
                </label>
                {!draft.unassignedOnly ? (
                  <div className="max-h-36 space-y-1 overflow-y-auto">
                    {assignees.map((user) => (
                      <label key={user.id} className={checkboxRowClassName}>
                        <input
                          type="checkbox"
                          checked={draft.assignedToUserIds.includes(user.id)}
                          onChange={() =>
                            setDraft((current) => ({
                              ...current,
                              assignedToUserIds: toggleValue(
                                current.assignedToUserIds,
                                user.id,
                              ),
                            }))
                          }
                        />
                        {user.firstName} {user.lastName}
                      </label>
                    ))}
                  </div>
                ) : null}
              </fieldset>

              <label className="block space-y-1 text-sm">
                <span className="font-medium">Organización</span>
                <SkeuInput
                  value={draft.organization ?? ""}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      organization: event.target.value || undefined,
                    }))
                  }
                />
              </label>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Categorías</legend>
                <div className="grid grid-cols-2 gap-1">
                  {projectCategories.map((category) => (
                    <label key={category} className={checkboxRowClassName}>
                      <input
                        type="checkbox"
                        checked={draft.categories.includes(category)}
                        onChange={() =>
                          setDraft((current) => ({
                            ...current,
                            categories: toggleValue(current.categories, category),
                          }))
                        }
                      />
                      {category}
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Modalidad</legend>
                <div className="grid grid-cols-2 gap-1">
                  {workModes.map((mode) => (
                    <label key={mode} className={checkboxRowClassName}>
                      <input
                        type="checkbox"
                        checked={draft.workModes.includes(mode)}
                        onChange={() =>
                          setDraft((current) => ({
                            ...current,
                            workModes: toggleValue(current.workModes, mode),
                          }))
                        }
                      />
                      {workModeLabels[mode]}
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="block space-y-1 text-sm">
                <span className="font-medium">País</span>
                <SkeuInput
                  placeholder="SV, GT"
                  value={draft.countryCodes.join(",")}
                  onChange={(event) => {
                    const codes = event.target.value
                      .split(/[\s,]+/)
                      .map((code) => code.trim().toUpperCase())
                      .filter((code) => /^[A-Z]{2}$/.test(code));
                    setDraft((current) => ({ ...current, countryCodes: codes }));
                  }}
                />
              </label>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Plazo</legend>
                <select
                  className={selectClassName}
                  value={draft.noDeadline ? "NONE" : draft.deadlinePreset}
                  onChange={(event) => {
                    const value = event.target.value;
                    setDraft((current) => ({
                      ...current,
                      deadlinePreset: value as LeadFiltersInput["deadlinePreset"],
                      noDeadline: value === "NONE",
                    }));
                  }}
                >
                  {deadlinePresets.map((preset) => (
                    <option key={preset} value={preset}>
                      {deadlinePresetLabels[preset]}
                    </option>
                  ))}
                </select>
                {draft.deadlinePreset === "CUSTOM" && !draft.noDeadline ? (
                  <div className="grid grid-cols-2 gap-2">
                    <SkeuInput
                      type="date"
                      value={draft.deadlineFrom?.slice(0, 10) ?? ""}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          deadlineFrom: event.target.value || undefined,
                        }))
                      }
                    />
                    <SkeuInput
                      type="date"
                      value={draft.deadlineTo?.slice(0, 10) ?? ""}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          deadlineTo: event.target.value || undefined,
                        }))
                      }
                    />
                  </div>
                ) : null}
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Score</legend>
                <select
                  className={selectClassName}
                  value={scorePreset}
                  onChange={(event) => {
                    const preset = event.target.value as ScorePreset;
                    setScorePreset(preset);
                    if (preset === "ANY") {
                      setDraft((current) => ({
                        ...current,
                        minScore: undefined,
                        maxScore: undefined,
                      }));
                      return;
                    }
                    if (preset === "CUSTOM") return;
                    const range = scoreRangeForPreset(preset);
                    setDraft((current) => ({
                      ...current,
                      minScore: range.minScore,
                      maxScore: range.maxScore,
                    }));
                  }}
                >
                  {scorePresets.map((preset) => (
                    <option key={preset} value={preset}>
                      {scorePresetLabels[preset]}
                    </option>
                  ))}
                </select>
                {scorePreset === "CUSTOM" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <SkeuInput
                      type="number"
                      min={0}
                      max={100}
                      placeholder="Mín"
                      value={draft.minScore ?? ""}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          minScore:
                            event.target.value === ""
                              ? undefined
                              : Number(event.target.value),
                        }))
                      }
                    />
                    <SkeuInput
                      type="number"
                      min={0}
                      max={100}
                      placeholder="Máx"
                      value={draft.maxScore ?? ""}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          maxScore:
                            event.target.value === ""
                              ? undefined
                              : Number(event.target.value),
                        }))
                      }
                    />
                  </div>
                ) : null}
              </fieldset>

              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-xs">
                  Creado desde
                  <SkeuInput
                    type="date"
                    value={draft.createdFrom?.slice(0, 10) ?? ""}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        createdFrom: event.target.value || undefined,
                      }))
                    }
                  />
                </label>
                <label className="space-y-1 text-xs">
                  Creado hasta
                  <SkeuInput
                    type="date"
                    value={draft.createdTo?.slice(0, 10) ?? ""}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        createdTo: event.target.value || undefined,
                      }))
                    }
                  />
                </label>
                <label className="space-y-1 text-xs">
                  Actualizado desde
                  <SkeuInput
                    type="date"
                    value={draft.updatedFrom?.slice(0, 10) ?? ""}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        updatedFrom: event.target.value || undefined,
                      }))
                    }
                  />
                </label>
                <label className="space-y-1 text-xs">
                  Actualizado hasta
                  <SkeuInput
                    type="date"
                    value={draft.updatedTo?.slice(0, 10) ?? ""}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        updatedTo: event.target.value || undefined,
                      }))
                    }
                  />
                </label>
              </div>
            </div>
            <div className="flex gap-2 border-t border-surface-border p-4">
              <SkeuButton
                type="button"
                variant="primary"
                className="flex-1"
                disabled={pending}
                onClick={() => applyDraft()}
              >
                Aplicar
              </SkeuButton>
              <SkeuButton
                type="button"
                variant="outline"
                onClick={() => navigate(buildClearedLeadFiltersQuery())}
              >
                Limpiar
              </SkeuButton>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
