"use client";

import { useEffect, useId, useState } from "react";
import { HelpCircle, X } from "lucide-react";

import { SkeuButton } from "@/components/ui/skeu-button";

export function HowItWorksLink() {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs font-medium text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(true)}
      >
        <HelpCircle className="size-3.5" aria-hidden />
        ¿Cómo funciona?
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="Cerrar"
            className="absolute inset-0 bg-text-primary/25"
            onClick={() => setOpen(false)}
          />
          <div
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${panelId}-title`}
            className="relative z-10 w-full max-w-lg rounded-t-lg border border-surface-border bg-surface-raised p-5 shadow-md sm:rounded-lg"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2
                id={`${panelId}-title`}
                className="font-heading text-lg font-semibold text-text-primary"
              >
                Cómo funciona esta pantalla
              </h2>
              <SkeuButton
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Cerrar"
                onClick={() => setOpen(false)}
              >
                <X />
              </SkeuButton>
            </div>
            <ol className="space-y-4 text-sm text-text-secondary">
              <li className="space-y-1">
                <p className="font-medium text-text-primary">1. Descubrir</p>
                <p>
                  Usa “Descubrir oportunidades” para traer candidatos nuevos
                  desde COMPRASAL (público) o sector privado (búsqueda
                  inteligente).
                </p>
              </li>
              <li className="space-y-1">
                <p className="font-medium text-text-primary">2. Filtrar</p>
                <p>
                  Los filtros solo buscan dentro de lo ya descubierto. No
                  consultan COMPRASAL ni Google.
                </p>
              </li>
              <li className="space-y-1">
                <p className="font-medium text-text-primary">3. Convertir</p>
                <p>
                  Abre una oportunidad, revísala y conviértela en Lead si
                  encaja con Creativa.
                </p>
              </li>
            </ol>
          </div>
        </div>
      ) : null}
    </>
  );
}
