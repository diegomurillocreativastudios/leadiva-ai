"use client";

import { useEffect, useId, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Trash2, X } from "lucide-react";

import { SkeuButton } from "@/components/ui/skeu-button";

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function DeleteSearchConfirmModal({
  open,
  searchLabel,
  pending = false,
  onClose,
  onConfirm,
}: {
  open: boolean;
  searchLabel: string;
  pending?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const isClient = useIsClient();

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose, pending]);

  if (!open || !isClient) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-text-primary/25"
        disabled={pending}
        onClick={() => {
          if (!pending) {
            onClose();
          }
        }}
      />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative z-[201] w-full max-w-sm overflow-hidden rounded-lg border border-surface-border bg-surface-raised shadow-md"
      >
        <div className="flex items-center justify-between border-b border-surface-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Trash2 className="size-5 text-danger" aria-hidden />
            <h2
              id={titleId}
              className="text-sm font-bold tracking-wide text-danger uppercase"
            >
              Eliminar búsqueda
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md p-1 text-text-secondary transition-colors hover:bg-surface-pressed hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-2 px-6 py-5">
          <p id={descriptionId} className="text-sm text-text-primary">
            ¿Eliminar esta búsqueda del historial? Esta acción no se puede
            deshacer desde aquí.
          </p>
          <p className="truncate text-sm font-medium text-text-secondary">
            {searchLabel}
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-surface-border px-6 py-4">
          <SkeuButton
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onClose}
          >
            Cancelar
          </SkeuButton>
          <SkeuButton
            type="button"
            variant="danger"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? "Eliminando…" : "Eliminar"}
          </SkeuButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
