"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import {
  ArrowRight,
  Brain,
  BriefcaseBusiness,
  Code2,
  Loader2,
  Search,
  Server,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { SkeuButton } from "@/components/ui/skeu-button";
import {
  FOCUS_HOME_SEARCH_FLAG,
  NEW_HOME_SEARCH_EVENT,
  pickHomeGreetingParts,
  type HomeGreetingParts,
} from "@/lib/home-greetings";
import {
  HOME_COMPRASAL_CATEGORIES,
  buildComprasalCategoryQuery,
  type HomeComprasalCategoryId,
} from "@/lib/home-comprasal-categories";
import { homeSearchHref } from "@/lib/home-search-href";
import {
  isPartialSearchResponse,
  readSearchHttpPayload,
} from "@/lib/search-http-response";
import {
  GROUNDED_HOME_QUERY_MAX_LENGTH,
  defaultHomeSearchSource,
  resolveHomeSearchRequest,
  type HomeSearchSourceId,
} from "@/lib/home-search-source";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS = {
  code: Code2,
  brain: Brain,
  server: Server,
  briefcase: BriefcaseBusiness,
} as const satisfies Record<
  (typeof HOME_COMPRASAL_CATEGORIES)[number]["icon"],
  LucideIcon
>;

export function AskLeadivaPrompt({
  variant = "hero",
  userName = "",
  source = defaultHomeSearchSource,
}: {
  /** `hero` shows the intro greeting; `docked` is input-only at the bottom. */
  variant?: "hero" | "docked";
  userName?: string;
  source?: HomeSearchSourceId;
} = {}) {
  const router = useRouter();
  const inputId = useId();
  const categoriesLegendId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<
    HomeComprasalCategoryId[]
  >([]);
  const [pending, startTransition] = useTransition();
  const [greeting, setGreeting] = useState<HomeGreetingParts | null>(null);
  const docked = variant === "docked";
  const isComprasal = source === "COMPRASAL";
  const groundedQuery = query.trim().slice(0, GROUNDED_HOME_QUERY_MAX_LENGTH);
  const canSubmit =
    !pending &&
    (isComprasal
      ? selectedCategories.length > 0
      : groundedQuery.length >= 3);

  const focusSearchIfEmpty = useCallback(() => {
    if (isComprasal) {
      return;
    }
    const input = inputRef.current;
    if (!input || input.value.trim().length > 0) {
      return;
    }
    input.focus();
  }, [isComprasal]);

  useEffect(() => {
    if (docked) {
      return;
    }

    const greetingFrame = requestAnimationFrame(() => {
      setGreeting(pickHomeGreetingParts(userName));
    });

    function onNewSearch() {
      setQuery("");
      setSelectedCategories([]);
      requestAnimationFrame(() => {
        focusSearchIfEmpty();
      });
    }

    if (sessionStorage.getItem(FOCUS_HOME_SEARCH_FLAG) === "1") {
      sessionStorage.removeItem(FOCUS_HOME_SEARCH_FLAG);
      requestAnimationFrame(() => {
        focusSearchIfEmpty();
      });
    }

    window.addEventListener(NEW_HOME_SEARCH_EVENT, onNewSearch);
    return () => {
      cancelAnimationFrame(greetingFrame);
      window.removeEventListener(NEW_HOME_SEARCH_EVENT, onNewSearch);
    };
  }, [docked, focusSearchIfEmpty, userName]);

  function toggleCategory(categoryId: HomeComprasalCategoryId) {
    setSelectedCategories((current) =>
      current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId],
    );
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestQuery = isComprasal
      ? buildComprasalCategoryQuery(selectedCategories)
      : query.trim().slice(0, GROUNDED_HOME_QUERY_MAX_LENGTH);
    const request = resolveHomeSearchRequest(source, requestQuery);

    if (isComprasal && selectedCategories.length === 0) {
      toast.error("Selecciona al menos una categoría para buscar.");
      return;
    }

    if (!isComprasal && requestQuery.length < 3) {
      toast.error("Escribe al menos 3 caracteres para buscar.");
      return;
    }

    startTransition(async () => {
      const toastId = toast.loading(request.loadingMessage);
      try {
        const response = await fetch(request.endpoint, {
          method: "POST",
          ...(request.body
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(request.body),
              }
            : {}),
        });
        const json = await readSearchHttpPayload(response);

        if (!response.ok && response.status !== 207) {
          toast.error(json.error ?? json.message ?? "Error en la búsqueda", {
            id: toastId,
          });
          if (json.executionId) {
            router.push(homeSearchHref(json.executionId));
            router.refresh();
          }
          return;
        }

        if (json.configured === false) {
          toast.message(
            json.message ??
              "Vertex AI no configurado. Completa GCP_PROJECT_ID.",
            { id: toastId },
          );
          router.refresh();
          return;
        }

        const partial = isPartialSearchResponse(response.status, json.status);
        const notify = partial ? toast.warning : toast.success;
        notify(
          partial
            ? "Búsqueda completada parcialmente"
            : "Búsqueda completada",
          {
            id: toastId,
            description: partial
              ? "Algunos resultados no pudieron procesarse."
              : `${json.candidatesFound ?? 0} candidatos · ${json.candidatesVerified ?? 0} verificados`,
            action: json.executionId
              ? {
                  label: "Ver resultados",
                  onClick: () => router.push(homeSearchHref(json.executionId)),
                }
              : undefined,
          },
        );

        setQuery("");
        setSelectedCategories([]);
        if (json.executionId) {
          router.push(homeSearchHref(json.executionId));
          router.refresh();
        } else {
          router.refresh();
        }
      } catch {
        toast.error("No se pudo conectar con el servidor", { id: toastId });
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-5xl"
      aria-label={
        docked
          ? "Nueva búsqueda en Leadiva AI"
          : "Buscar oportunidades con Leadiva AI"
      }
      {...(!docked
        ? { "aria-labelledby": `${inputId}-heading` }
        : undefined)}
    >
      {!docked ? (
        <h1
          id={`${inputId}-heading`}
          className="mb-10 min-h-[1.2em] text-center font-heading text-4xl font-semibold tracking-tight text-text-primary md:text-5xl"
        >
          {greeting ? (
            <>
              {greeting.before}
              {greeting.name}
              {greeting.after}
            </>
          ) : (
            "\u00a0"
          )}
        </h1>
      ) : null}

      {isComprasal ? (
        <div className="space-y-4">
          <fieldset disabled={pending} className="min-w-0">
            <legend id={categoriesLegendId} className="sr-only">
              Categorías COMPRASAL
            </legend>
            <div
              role="group"
              aria-labelledby={categoriesLegendId}
              className={cn(
                "grid grid-cols-1 gap-3 sm:grid-cols-2",
                pending && "opacity-80",
              )}
            >
              {HOME_COMPRASAL_CATEGORIES.map((category) => {
                const Icon = CATEGORY_ICONS[category.icon];
                const checked = selectedCategories.includes(category.id);
                const checkboxId = `${inputId}-${category.id}`;

                return (
                  <label
                    key={category.id}
                    htmlFor={checkboxId}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-xl border bg-surface-raised px-4 py-3.5",
                      "border-surface-border transition-colors duration-150",
                      "hover:bg-accent-mint/40",
                      "has-focus-visible:ring-2 has-focus-visible:ring-accent/40",
                      checked && "border-accent bg-accent-mint/70",
                      docked && "px-3 py-3",
                    )}
                  >
                    <input
                      id={checkboxId}
                      type="checkbox"
                      checked={checked}
                      disabled={pending}
                      onChange={() => toggleCategory(category.id)}
                      className="size-4 shrink-0 accent-accent-coral"
                    />
                    <Icon
                      className={cn(
                        "shrink-0 text-accent",
                        docked ? "size-4" : "size-5",
                      )}
                      aria-hidden
                    />
                    <span
                      className={cn(
                        "font-medium text-text-primary select-none",
                        docked ? "text-sm" : "text-sm md:text-base",
                      )}
                    >
                      {category.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div className="flex justify-end">
            <SkeuButton
              type="submit"
              variant="primary"
              size={docked ? "sm" : "lg"}
              disabled={!canSubmit}
              aria-label={pending ? "Buscando" : "Buscar oportunidades"}
              className="gap-2"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <ArrowRight className="size-4" aria-hidden />
              )}
              Buscar
            </SkeuButton>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "flex items-center gap-3 border border-surface-border bg-surface-raised px-4 transition-colors duration-150",
            "focus-within:border-accent focus-within:ring-1 focus-within:ring-accent",
            docked ? "h-12 rounded-2xl" : "h-16 rounded-2xl",
            pending && "opacity-80",
          )}
        >
          <Search
            className={cn(
              "shrink-0 text-accent",
              docked ? "size-5" : "size-6",
            )}
            aria-hidden
          />
          <label htmlFor={inputId} className="sr-only">
            Pregunta a Leadiva AI
          </label>
          <input
            ref={inputRef}
            id={inputId}
            name="query"
            type="text"
            autoFocus={!docked}
            autoComplete="off"
            disabled={pending}
            maxLength={GROUNDED_HOME_QUERY_MAX_LENGTH}
            value={query}
            onChange={(event) =>
              setQuery(
                event.target.value.slice(0, GROUNDED_HOME_QUERY_MAX_LENGTH),
              )
            }
            placeholder="Pregunta a Leadiva AI"
            className={cn(
              "min-w-0 flex-1 bg-transparent text-text-primary outline-none placeholder:text-text-secondary/70 disabled:cursor-not-allowed",
              docked ? "text-base" : "text-lg",
            )}
          />
          <span className="shrink-0 text-xs text-text-secondary tabular-nums">
            {query.length}/{GROUNDED_HOME_QUERY_MAX_LENGTH}
          </span>
          <SkeuButton
            type="submit"
            variant="primary"
            size={docked ? "icon-sm" : "icon"}
            disabled={!canSubmit}
            aria-label={pending ? "Buscando" : "Buscar oportunidades"}
          >
            {pending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <ArrowRight aria-hidden />
            )}
          </SkeuButton>
        </div>
      )}
    </form>
  );
}
