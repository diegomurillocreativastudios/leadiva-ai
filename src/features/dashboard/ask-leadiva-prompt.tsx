"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { ArrowRight, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { SkeuButton } from "@/components/ui/skeu-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FOCUS_HOME_SEARCH_FLAG,
  NEW_HOME_SEARCH_EVENT,
  pickHomeGreetingParts,
  type HomeGreetingParts,
} from "@/lib/home-greetings";
import { homeSearchHref } from "@/lib/home-search-href";
import {
  HOME_SEARCH_SOURCES,
  defaultHomeSearchSource,
  homeSearchSourceIds,
  resolveHomeSearchRequest,
  type HomeSearchSourceId,
} from "@/lib/home-search-source";
import { cn } from "@/lib/utils";

type SearchResponse = {
  executionId?: string;
  error?: string;
  message?: string;
  configured?: boolean;
  status?: string;
  candidatesCreated?: number;
  candidatesUpdated?: number;
  candidatesDiscarded?: number;
  candidatesFound?: number;
  candidatesVerified?: number;
};

function isHomeSearchSourceId(value: string): value is HomeSearchSourceId {
  return (homeSearchSourceIds as readonly string[]).includes(value);
}

export function AskLeadivaPrompt({
  variant = "hero",
  userName = "",
}: {
  /** `hero` shows the intro greeting; `docked` is input-only at the bottom. */
  variant?: "hero" | "docked";
  userName?: string;
} = {}) {
  const router = useRouter();
  const inputId = useId();
  const sourceId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<HomeSearchSourceId>(
    defaultHomeSearchSource,
  );
  const [pending, startTransition] = useTransition();
  const [greeting, setGreeting] = useState<HomeGreetingParts | null>(null);
  const docked = variant === "docked";
  const searchRequest = resolveHomeSearchRequest(source, query.trim());
  const minimumQueryLength = source === "COMPRASAL" ? 2 : 3;
  const canSubmit =
    !pending &&
    (!searchRequest.requiresQuery || query.trim().length >= minimumQueryLength);

  function focusSearchIfEmpty() {
    const input = inputRef.current;
    if (!input || input.value.trim().length > 0) {
      return;
    }
    input.focus();
  }

  useEffect(() => {
    if (docked) {
      return;
    }

    const greetingFrame = requestAnimationFrame(() => {
      setGreeting(pickHomeGreetingParts(userName));
    });

    function onNewSearch() {
      setQuery("");
      requestAnimationFrame(() => {
        inputRef.current?.focus();
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
  }, [docked, userName]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    const request = resolveHomeSearchRequest(source, trimmed);

    const minimumLength = source === "COMPRASAL" ? 2 : 3;
    if (request.requiresQuery && trimmed.length < minimumLength) {
      toast.error(`Escribe al menos ${minimumLength} caracteres para buscar.`);
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
        const json = (await response.json()) as SearchResponse;

        if (!response.ok && response.status !== 207) {
          toast.error(json.error ?? json.message ?? "Error en la búsqueda", {
            id: toastId,
          });
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

        toast.success("Búsqueda completada", {
          id: toastId,
          description: `${json.candidatesFound ?? 0} candidatos · ${json.candidatesVerified ?? 0} verificados`,
          action: json.executionId
            ? {
                label: "Ver resultados",
                onClick: () => router.push(homeSearchHref(json.executionId)),
              }
            : undefined,
        });

        setQuery("");
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
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Pregunta a Leadiva AI"
          className={cn(
            "min-w-0 flex-1 bg-transparent text-text-primary outline-none placeholder:text-text-secondary/70 disabled:cursor-not-allowed",
            docked ? "text-base" : "text-lg",
          )}
        />
        <label htmlFor={sourceId} className="sr-only">
          Origen de la búsqueda
        </label>
        <Select
          value={source}
          disabled={pending}
          onValueChange={(value) => {
            if (isHomeSearchSourceId(value)) {
              setSource(value);
            }
          }}
        >
          <SelectTrigger
            id={sourceId}
            size="sm"
            aria-label="Origen de la búsqueda"
            className={cn(
              "shrink-0 border-surface-border bg-surface-pressed font-medium text-text-primary shadow-none",
              "hover:bg-accent-mint/70 focus-visible:border-accent focus-visible:ring-accent/40",
              "data-placeholder:text-text-secondary",
              "[&_svg]:text-text-secondary",
              docked
                ? "h-8 max-w-38 rounded-full px-3 text-xs"
                : "h-10 max-w-44 rounded-full px-3.5 text-sm",
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            align="end"
            position="popper"
            className="min-w-44 rounded-xl border-surface-border bg-surface-raised p-1.5 text-text-primary shadow-md"
          >
            {HOME_SEARCH_SOURCES.map((option) => (
              <SelectItem
                key={option.id}
                value={option.id}
                className={cn(
                  "cursor-pointer rounded-lg py-2 pr-8 pl-2.5 text-text-primary",
                  "focus:!bg-accent-mint focus:!text-text-primary",
                  "focus:**:!text-text-primary focus:[&_svg]:!text-text-primary",
                  "data-[highlighted]:!bg-accent-mint data-[highlighted]:!text-text-primary",
                  "data-[highlighted]:**:!text-text-primary data-[highlighted]:[&_svg]:!text-text-primary",
                )}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
    </form>
  );
}
