"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Building2, Landmark, Plus } from "lucide-react";
import { toast } from "sonner";

import { SkeuButton } from "@/components/ui/skeu-button";
import { searchActivityHref } from "@/features/projects/search-activity-trigger";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type SyncResponse = {
  error?: string;
  status?: string;
  candidatesCreated?: number;
  candidatesUpdated?: number;
  candidatesDiscarded?: number;
  candidatesFound?: number;
};

type SearchResponse = {
  executionId?: string;
  error?: string;
  message?: string;
  configured?: boolean;
  status?: string;
  outcome?: string;
  candidatesCreated?: number;
  candidatesUpdated?: number;
  candidatesUnchanged?: number;
  candidatesDiscarded?: number;
  candidatesFound?: number;
  candidatesVerified?: number;
  groundingSourcesFound?: number;
  discoveryMode?: "GROUNDING_ONLY" | "PROVIDER_SEARCH";
  searchProvider?: string;
  providerResults?: number;
  uniqueUrls?: number;
  uniqueDomains?: number;
  documentsFetched?: number;
  documentsExtracted?: number;
  groundingVerifications?: number;
};

export function DiscoverOpportunitiesMenu({
  size = "default",
}: {
  size?: "default" | "sm";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function runComprasal() {
    startTransition(async () => {
      const toastId = toast.loading("Sincronizando COMPRASAL…");
      try {
        const response = await fetch("/api/jobs/sync-comprasal", {
          method: "POST",
        });
        const json = (await response.json()) as SyncResponse;

        if (!response.ok && response.status !== 207) {
          toast.error(json.error ?? "Error al sincronizar", { id: toastId });
          return;
        }

        toast.success(
          [
            json.status === "PARTIALLY_COMPLETED"
              ? "Sync parcial"
              : "Sincronizado",
            `${json.candidatesCreated ?? 0} creados`,
            `${json.candidatesUpdated ?? 0} actualizados`,
            `${json.candidatesDiscarded ?? 0} descartados`,
          ].join(" · "),
          { id: toastId },
        );
        router.refresh();
      } catch {
        toast.error("No se pudo conectar con el servidor", { id: toastId });
      }
    });
  }

  function runPrivate() {
    startTransition(async () => {
      const toastId = toast.loading("Buscando sector privado…");
      try {
        const response = await fetch("/api/jobs/search-grounding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceType: "PRIVATE_WEB" }),
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

        const candidatesFound = json.candidatesFound ?? 0;
        const candidatesVerified = json.candidatesVerified ?? 0;
        const discoveryCount =
          json.discoveryMode === "PROVIDER_SEARCH"
            ? `${json.providerResults ?? 0} resultados web`
            : `${json.groundingSourcesFound ?? 0} fuentes`;
        toast.success("Búsqueda completada", {
          id: toastId,
          description: `${discoveryCount}, ${candidatesFound} candidato${candidatesFound === 1 ? "" : "s"} y ${candidatesVerified} oportunidad${candidatesVerified === 1 ? "" : "es"} verificada${candidatesVerified === 1 ? "" : "s"}.`,
          action: json.executionId
            ? {
                label: "Ver resultados",
                onClick: () => router.push(searchActivityHref(json.executionId)),
              }
            : undefined,
        });
        router.refresh();
      } catch {
        toast.error("No se pudo conectar con el servidor", { id: toastId });
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SkeuButton
          type="button"
          variant="primary"
          size={size}
          disabled={pending}
          aria-label="Descubrir oportunidades"
        >
          <Plus aria-hidden />
          {pending ? "Descubriendo…" : "Descubrir oportunidades"}
        </SkeuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-1.5">
        <DropdownMenuLabel className="px-2 py-1.5 text-xs font-medium text-text-secondary">
          Origen de la búsqueda
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer items-start gap-3 rounded-md px-2 py-2.5 focus:bg-accent-mint focus:text-text-primary"
          disabled={pending}
          onSelect={() => {
            runComprasal();
          }}
        >
          <Landmark className="mt-0.5 size-4 text-accent" aria-hidden />
          <span className="flex flex-col gap-0.5">
            <span className="font-medium text-text-primary">COMPRASAL</span>
            <span className="text-xs leading-snug whitespace-normal text-text-secondary">
              Oportunidades y procesos provenientes del sector público.
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer items-start gap-3 rounded-md px-2 py-2.5 focus:bg-accent-mint focus:text-text-primary"
          disabled={pending}
          onSelect={() => {
            runPrivate();
          }}
        >
          <Building2 className="mt-0.5 size-4 text-accent" aria-hidden />
          <span className="flex flex-col gap-0.5">
            <span className="font-medium text-text-primary">Sector privado</span>
            <span className="text-xs leading-snug whitespace-normal text-text-secondary">
              Empresas y oportunidades encontradas mediante búsqueda
              inteligente.
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
