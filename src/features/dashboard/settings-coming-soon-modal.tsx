"use client";

import { useEffect, useId, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Settings, X } from "lucide-react";

import { Label } from "@/components/ui/label";

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function SettingsComingSoonModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const isClient = useIsClient();

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || !isClient) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="Cerrar configuración"
        className="absolute inset-0 bg-text-primary/25"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[201] w-full max-w-sm overflow-hidden rounded-lg border border-surface-border bg-surface-raised shadow-md"
      >
        <div className="flex items-center justify-between border-b border-surface-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Settings className="size-5 text-accent" aria-hidden />
            <h2
              id={titleId}
              className="text-sm font-bold tracking-wide text-accent uppercase"
            >
              Configuración
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-text-secondary transition-colors hover:bg-surface-pressed hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            aria-label="Cerrar"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex items-center justify-center px-6 py-10">
          <Label className="text-base text-text-secondary">Pronto...</Label>
        </div>
      </div>
    </div>,
    document.body,
  );
}
