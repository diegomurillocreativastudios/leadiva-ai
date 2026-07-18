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
  FOCUS_HOME_SEARCH_FLAG,
  NEW_HOME_SEARCH_EVENT,
  pickHomeGreeting,
} from "@/lib/home-greetings";
import { homeSearchHref } from "@/lib/home-search-href";
import { cn } from "@/lib/utils";

type SearchResponse = {
  executionId?: string;
  error?: string;
  message?: string;
  configured?: boolean;
  candidatesFound?: number;
  candidatesVerified?: number;
};

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [greeting, setGreeting] = useState("");
  const docked = variant === "docked";

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

    setGreeting(pickHomeGreeting(userName));

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
      window.removeEventListener(NEW_HOME_SEARCH_EVENT, onNewSearch);
    };
  }, [docked, userName]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      toast.error("Escribe al menos 3 caracteres para buscar.");
      return;
    }

    startTransition(async () => {
      const toastId = toast.loading("Buscando oportunidades…");
      try {
        const response = await fetch("/api/jobs/search-grounding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceType: "PRIVATE_WEB",
            query: trimmed,
          }),
        });
        const json = (await response.json()) as SearchResponse;

        if (!response.ok) {
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
          className="mb-10 min-h-[1.2em] text-center font-heading text-2xl font-semibold tracking-tight text-text-primary md:text-3xl"
        >
          {greeting || "\u00a0"}
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
        <SkeuButton
          type="submit"
          variant="primary"
          size={docked ? "icon-sm" : "icon"}
          disabled={pending || query.trim().length < 3}
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
