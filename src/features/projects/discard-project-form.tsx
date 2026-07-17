"use client";

import { useActionState } from "react";

import {
  discardProjectAction,
  type ActionState,
} from "@/features/auth/actions";
import { SkeuButton } from "@/components/ui/skeu-button";
import { SkeuTextarea } from "@/components/ui/skeu-input";

const initial: ActionState = {};

export function DiscardProjectForm({
  searchResultId,
}: {
  searchResultId: string;
}) {
  const [state, formAction, pending] = useActionState(
    discardProjectAction,
    initial,
  );

  return (
    <details className="rounded-md border border-surface-border bg-surface-raised">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm text-text-secondary marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="font-medium text-text-primary">¿No es relevante?</span>
        <span className="ml-2">Descartar candidato</span>
      </summary>
      <form action={formAction} className="space-y-3 border-t border-surface-border px-4 py-3">
        <input type="hidden" name="searchResultId" value={searchResultId} />
        <SkeuTextarea
          name="reason"
          rows={2}
          required
          minLength={3}
          placeholder="Motivo del descarte (mín. 3 caracteres)…"
          aria-label="Motivo del descarte"
        />
        {state.error ? (
          <p className="text-sm text-danger" role="alert">
            {state.error}
          </p>
        ) : null}
        <SkeuButton type="submit" variant="danger" size="sm" disabled={pending}>
          {pending ? "Descartando…" : "Descartar candidato"}
        </SkeuButton>
      </form>
    </details>
  );
}
