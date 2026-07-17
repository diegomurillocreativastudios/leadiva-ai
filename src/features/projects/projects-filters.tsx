"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { Filter, RotateCcw, Search, X } from "lucide-react";

import { SkeuButton } from "@/components/ui/skeu-button";
import { SkeuInput } from "@/components/ui/skeu-input";
import {
  buildProjectFilterChips,
} from "@/features/projects/project-filter-chips";
import {
  formatSearchExecutionLabel,
  type SearchExecutionOption,
} from "@/lib/filters/execution-label";
import { reviewStatusLabels, sourceTypeLabels, workModeLabels } from "@/lib/filters/labels";
import {
  deadlinePresetLabels,
  deadlinePresets,
  discoveredPresetLabels,
  discoveredPresets,
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
  type SourceGroupId,
} from "@/lib/filters/source-groups";
import { projectSortOptions } from "@/lib/project-catalog";
import {
  buildClearedProjectFiltersQuery,
  buildDefaultProjectFiltersQuery,
  serializeProjectFilters,
  type ProjectFiltersInput,
} from "@/schemas/projects";
import {
  projectCategories,
  sourceTypes,
  verificationStatuses,
  workModes,
} from "@/server/db/schema/enums";

const sortLabels: Record<(typeof projectSortOptions)[number], string> = {
  discovered_desc: "Descubierto · reciente",
  discovered_asc: "Descubierto · antiguo",
  deadline_asc: "Plazo · próximo",
  deadline_desc: "Plazo · lejano",
  score_desc: "Ordenar por score",
  score_asc: "Score · bajo",
  organization_asc: "Organización · A-Z",
};

const selectClassName =
  "h-10 w-full rounded-md border border-surface-border bg-surface-raised px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40";

const checkboxRowClassName =
  "flex items-center gap-2 rounded-md px-1 py-1 text-sm text-text-primary hover:bg-surface-pressed";

function toggleValue<T extends string>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

export function ProjectsFilters({
  filters,
  executions,
}: {
  filters: ProjectFiltersInput;
  executions: SearchExecutionOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [panelOpen, setPanelOpen] = useState(false);
  const panelId = useId();

  const [draft, setDraft] = useState(filters);
  const [scorePreset, setScorePreset] = useState<ScorePreset>(
    filters.scorePreset,
  );

  const chips = useMemo(
    () => buildProjectFilterChips(filters, executions),
    [filters, executions],
  );

  const activeSourceGroup = detectSourceGroup(filters.sourceTypes);

  function openPanel() {
    setDraft(filters);
    setScorePreset(filters.scorePreset);
    setPanelOpen(true);
  }

  useEffect(() => {
    if (!panelOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPanelOpen(false);
      }
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
      router.push(`/projects${query}`);
      setPanelOpen(false);
    });
  }

  function applyDraft(next: ProjectFiltersInput = draft) {
    navigate(serializeProjectFilters({ ...next, cleared: false, page: 1 }));
  }

  function applyScorePreset(preset: ScorePreset) {
    setScorePreset(preset);
    if (preset === "ANY") {
      setDraft((current) => ({
        ...current,
        minScore: undefined,
        maxScore: undefined,
        scorePreset: "ANY",
      }));
      return;
    }
    if (preset === "CUSTOM") {
      setDraft((current) => ({
        ...current,
        scorePreset: "CUSTOM",
      }));
      return;
    }
    const range = scoreRangeForPreset(preset);
    setDraft((current) => ({
      ...current,
      minScore: range.minScore,
      maxScore: range.maxScore,
      scorePreset: preset,
    }));
  }

  function applySourceGroup(group: SourceGroupId) {
    setDraft((current) => ({
      ...current,
      sourceTypes: sourceTypesForGroup(group),
    }));
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
            placeholder="Buscar por título u organización"
            defaultValue={filters.q ?? ""}
            aria-label="Buscar por título u organización"
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
                sort: event.target.value as ProjectFiltersInput["sort"],
                q: filters.q,
              });
            }}
          >
            {projectSortOptions.map((sort) => (
              <option key={sort} value={sort}>
                {sortLabels[sort]}
              </option>
            ))}
          </select>

          <SkeuButton
            type="submit"
            variant="primary"
            size="sm"
            className="h-10"
            disabled={pending}
          >
            {pending ? "Buscando…" : "Buscar"}
          </SkeuButton>
        </div>
      </form>

      {/* Quick source groups */}
      <div className="flex flex-wrap gap-2">
        {sourceGroupIds.map((group) => {
          const selected =
            group === "ALL"
              ? filters.sourceTypes.length === 0
              : activeSourceGroup === group;
          return (
            <button
              key={group}
              type="button"
              className={`rounded-md border px-2.5 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                selected
                  ? "border-accent bg-accent-mint text-accent"
                  : "border-surface-border bg-surface-raised text-text-primary hover:bg-surface-pressed"
              }`}
              onClick={() => {
                const sourceTypesNext = sourceTypesForGroup(group);
                navigate(
                  serializeProjectFilters(filters, {
                    sourceTypes: sourceTypesNext,
                    cleared: false,
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
              className="inline-flex items-center gap-1 rounded-md border border-surface-border bg-surface-raised px-2 py-1 text-xs text-text-primary hover:bg-surface-pressed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              {chip.label}
              <X className="size-3 text-text-secondary" aria-hidden />
              <span className="sr-only">Quitar filtro {chip.label}</span>
            </Link>
          ))}
          <button
            type="button"
            className="text-xs font-medium text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            disabled={pending}
            onClick={() => navigate(buildClearedProjectFiltersQuery())}
          >
            Limpiar filtros
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            disabled={pending}
            onClick={() => navigate(buildDefaultProjectFiltersQuery())}
          >
            <RotateCcw className="size-3" aria-hidden />
            Restaurar predeterminados
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary underline-offset-2 hover:underline"
            disabled={pending}
            onClick={() => navigate(buildDefaultProjectFiltersQuery())}
          >
            <RotateCcw className="size-3" aria-hidden />
            Restaurar predeterminados
          </button>
        </div>
      )}

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
            aria-labelledby={`${panelId}-title`}
            className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-surface-border bg-surface-raised shadow-md sm:max-w-lg"
          >
            <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
              <h2
                id={`${panelId}-title`}
                className="font-heading text-base font-semibold text-text-primary"
              >
                Más filtros
              </h2>
              <SkeuButton
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Cerrar"
                onClick={() => setPanelOpen(false)}
              >
                <X />
              </SkeuButton>
            </div>

            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 space-y-5 overflow-y-auto p-4">
                <p className="text-xs text-text-secondary">
                  Estos filtros solo reducen lo ya descubierto. No consultan
                  fuentes externas.
                </p>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-text-primary">
                    Alcance
                  </legend>
                  <select
                    className={selectClassName}
                    value={draft.scope}
                    onChange={(event) => {
                      const scope = event.target
                        .value as ProjectFiltersInput["scope"];
                      setDraft((current) => ({
                        ...current,
                        scope,
                        categories:
                          scope === "CUSTOM" ? current.categories : [],
                      }));
                    }}
                  >
                    <option value="INTERESTS">Solo mis intereses</option>
                    <option value="ALL">Todo el catálogo</option>
                    <option value="CUSTOM">Categorías personalizadas</option>
                  </select>
                </fieldset>

                {(draft.scope === "CUSTOM" || draft.categories.length > 0) && (
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium text-text-primary">
                      Categorías
                    </legend>
                    <div className="grid grid-cols-2 gap-1">
                      {projectCategories.map((category) => (
                        <label key={category} className={checkboxRowClassName}>
                          <input
                            type="checkbox"
                            checked={draft.categories.includes(category)}
                            onChange={() => {
                              setDraft((current) => ({
                                ...current,
                                scope: "CUSTOM",
                                categories: toggleValue(
                                  current.categories,
                                  category,
                                ),
                              }));
                            }}
                          />
                          {category}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-text-primary">
                    Fuentes
                  </legend>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {sourceGroupIds.map((group) => (
                      <button
                        key={group}
                        type="button"
                        className="rounded-md border border-surface-border px-2 py-0.5 text-[11px] hover:bg-surface-pressed"
                        onClick={() => applySourceGroup(group)}
                      >
                        {sourceGroupLabels[group]}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {sourceTypes.map((source) => (
                      <label key={source} className={checkboxRowClassName}>
                        <input
                          type="checkbox"
                          checked={draft.sourceTypes.includes(source)}
                          onChange={() => {
                            setDraft((current) => ({
                              ...current,
                              sourceTypes: toggleValue(
                                current.sourceTypes,
                                source,
                              ),
                            }));
                          }}
                        />
                        {sourceTypeLabels[source]}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-text-primary">
                    Estado de revisión
                  </legend>
                  <div className="grid grid-cols-2 gap-1">
                    {verificationStatuses.map((status) => (
                      <label key={status} className={checkboxRowClassName}>
                        <input
                          type="checkbox"
                          checked={draft.verificationStatuses.includes(status)}
                          onChange={() => {
                            setDraft((current) => ({
                              ...current,
                              verificationStatuses: toggleValue(
                                current.verificationStatuses,
                                status,
                              ),
                            }));
                          }}
                        />
                        {reviewStatusLabels[status]}
                      </label>
                    ))}
                  </div>
                  <p className="text-[11px] text-text-secondary">
                    Sin selección = todos los estados. (Fase 3 separará
                    verificación documental de revisión.)
                  </p>
                </fieldset>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-text-primary">
                    Plazo
                  </legend>
                  <select
                    className={selectClassName}
                    value={draft.deadlinePreset}
                    onChange={(event) => {
                      setDraft((current) => ({
                        ...current,
                        deadlinePreset: event.target
                          .value as ProjectFiltersInput["deadlinePreset"],
                      }));
                    }}
                  >
                    {deadlinePresets.map((preset) => (
                      <option key={preset} value={preset}>
                        {deadlinePresetLabels[preset]}
                      </option>
                    ))}
                  </select>
                  {draft.deadlinePreset === "CUSTOM" ? (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="space-y-1 text-xs">
                        Desde
                        <SkeuInput
                          type="date"
                          value={draft.deadlineFrom?.slice(0, 10) ?? ""}
                          onChange={(event) => {
                            setDraft((current) => ({
                              ...current,
                              deadlineFrom: event.target.value || undefined,
                            }));
                          }}
                        />
                      </label>
                      <label className="space-y-1 text-xs">
                        Hasta
                        <SkeuInput
                          type="date"
                          value={draft.deadlineTo?.slice(0, 10) ?? ""}
                          onChange={(event) => {
                            setDraft((current) => ({
                              ...current,
                              deadlineTo: event.target.value || undefined,
                            }));
                          }}
                        />
                      </label>
                    </div>
                  ) : null}
                </fieldset>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-text-primary">
                    Score
                  </legend>
                  <select
                    className={selectClassName}
                    value={scorePreset}
                    onChange={(event) => {
                      applyScorePreset(event.target.value as ScorePreset);
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
                      <label className="space-y-1 text-xs">
                        Mínimo
                        <SkeuInput
                          type="number"
                          min={0}
                          max={100}
                          value={draft.minScore ?? ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            setDraft((current) => ({
                              ...current,
                              minScore:
                                value === "" ? undefined : Number(value),
                              scorePreset: "CUSTOM",
                            }));
                          }}
                        />
                      </label>
                      <label className="space-y-1 text-xs">
                        Máximo
                        <SkeuInput
                          type="number"
                          min={0}
                          max={100}
                          value={draft.maxScore ?? ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            setDraft((current) => ({
                              ...current,
                              maxScore:
                                value === "" ? undefined : Number(value),
                              scorePreset: "CUSTOM",
                            }));
                          }}
                        />
                      </label>
                    </div>
                  ) : null}
                </fieldset>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-text-primary">
                    Descubrimiento
                  </legend>
                  <select
                    className={selectClassName}
                    value={draft.discoveredPreset}
                    onChange={(event) => {
                      setDraft((current) => ({
                        ...current,
                        discoveredPreset: event.target
                          .value as ProjectFiltersInput["discoveredPreset"],
                      }));
                    }}
                  >
                    {discoveredPresets.map((preset) => (
                      <option key={preset} value={preset}>
                        {discoveredPresetLabels[preset]}
                      </option>
                    ))}
                  </select>
                  {draft.discoveredPreset === "CUSTOM" ? (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="space-y-1 text-xs">
                        Desde
                        <SkeuInput
                          type="date"
                          value={draft.discoveredFrom?.slice(0, 10) ?? ""}
                          onChange={(event) => {
                            setDraft((current) => ({
                              ...current,
                              discoveredFrom: event.target.value || undefined,
                            }));
                          }}
                        />
                      </label>
                      <label className="space-y-1 text-xs">
                        Hasta
                        <SkeuInput
                          type="date"
                          value={draft.discoveredTo?.slice(0, 10) ?? ""}
                          onChange={(event) => {
                            setDraft((current) => ({
                              ...current,
                              discoveredTo: event.target.value || undefined,
                            }));
                          }}
                        />
                      </label>
                    </div>
                  ) : null}
                </fieldset>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-text-primary">
                    Modalidad
                  </legend>
                  <div className="grid grid-cols-2 gap-1">
                    {workModes.map((mode) => (
                      <label key={mode} className={checkboxRowClassName}>
                        <input
                          type="checkbox"
                          checked={draft.workModes.includes(mode)}
                          onChange={() => {
                            setDraft((current) => ({
                              ...current,
                              workModes: toggleValue(current.workModes, mode),
                            }));
                          }}
                        />
                        {workModeLabels[mode]}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label className="block space-y-1.5 text-sm">
                  <span className="font-medium text-text-primary">País</span>
                  <SkeuInput
                    placeholder="SV (puedes agregar varios separados por coma)"
                    value={draft.countryCodes.join(",")}
                    onChange={(event) => {
                      const codes = event.target.value
                        .split(/[\s,]+/)
                        .map((code) => code.trim().toUpperCase())
                        .filter((code) => /^[A-Z]{2}$/.test(code));
                      setDraft((current) => ({
                        ...current,
                        countryCodes: codes,
                      }));
                    }}
                  />
                </label>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-text-primary">
                    Ejecuciones
                  </legend>
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-surface-border p-2">
                    {executions.length === 0 ? (
                      <p className="text-xs text-text-secondary">
                        No hay ejecuciones recientes.
                      </p>
                    ) : (
                      executions.map((execution) => (
                        <label
                          key={execution.id}
                          className={checkboxRowClassName}
                        >
                          <input
                            type="checkbox"
                            checked={draft.searchExecutionIds.includes(
                              execution.id,
                            )}
                            onChange={() => {
                              setDraft((current) => ({
                                ...current,
                                searchExecutionIds: toggleValue(
                                  current.searchExecutionIds,
                                  execution.id,
                                ),
                              }));
                            }}
                          />
                          <span className="text-xs leading-snug">
                            {formatSearchExecutionLabel(execution)}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </fieldset>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-surface-border p-4">
                <SkeuButton
                  type="button"
                  variant="primary"
                  className="flex-1"
                  disabled={pending}
                  onClick={() => applyDraft(draft)}
                >
                  {pending ? "Aplicando…" : "Aplicar filtros"}
                </SkeuButton>
                <SkeuButton
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => navigate(buildClearedProjectFiltersQuery())}
                >
                  Limpiar
                </SkeuButton>
                <SkeuButton
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => navigate(buildDefaultProjectFiltersQuery())}
                >
                  Predeterminados
                </SkeuButton>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
