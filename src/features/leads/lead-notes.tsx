"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";

import {
  addLeadNoteAction,
  deleteLeadNoteAction,
  updateLeadNoteAction,
  type ActionState,
} from "@/features/auth/actions";
import { SkeuButton } from "@/components/ui/skeu-button";
import {
  SkeuCard,
  SkeuCardContent,
  SkeuCardHeader,
  SkeuCardTitle,
} from "@/components/ui/skeu-card";
import { SkeuTextarea } from "@/components/ui/skeu-input";
import { useActionToast } from "@/lib/use-action-toast";

const initial: ActionState = {};

export function LeadNotes({
  opportunityId,
  notes,
}: {
  opportunityId: string;
  notes: Array<{
    id: string;
    content: string;
    createdAt: Date;
    authorName: string;
  }>;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [editingId, setEditingId] = useState<string | null>(null);

  const [addState, addAction, addPending] = useActionState(
    addLeadNoteAction,
    initial,
  );
  const [updateState, updateAction, updatePending] = useActionState(
    updateLeadNoteAction,
    initial,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteLeadNoteAction,
    initial,
  );

  useActionToast(addState, refresh);
  useActionToast(updateState, () => {
    setEditingId(null);
    refresh();
  });
  useActionToast(deleteState, refresh);

  return (
    <SkeuCard>
      <SkeuCardHeader>
        <SkeuCardTitle>Notas internas</SkeuCardTitle>
      </SkeuCardHeader>
      <SkeuCardContent className="space-y-4">
        <form action={addAction} className="space-y-3">
          <input type="hidden" name="opportunityId" value={opportunityId} />
          <SkeuTextarea
            name="content"
            rows={3}
            required
            placeholder="Agregar comentario interno…"
            aria-label="Nueva nota"
          />
          <SkeuButton type="submit" variant="primary" size="sm" disabled={addPending}>
            {addPending ? "Guardando…" : "Agregar nota"}
          </SkeuButton>
        </form>

        {notes.length === 0 ? (
          <p className="text-sm text-text-secondary">Sin notas todavía.</p>
        ) : (
          <ul className="space-y-3">
            {notes.map((note) => (
              <li
                key={note.id}
                className="rounded-md border border-surface-border bg-surface-base p-3"
              >
                {editingId === note.id ? (
                  <form action={updateAction} className="space-y-2">
                    <input type="hidden" name="noteId" value={note.id} />
                    <input
                      type="hidden"
                      name="opportunityId"
                      value={opportunityId}
                    />
                    <SkeuTextarea
                      name="content"
                      rows={3}
                      required
                      defaultValue={note.content}
                      aria-label="Editar nota"
                    />
                    <div className="flex gap-2">
                      <SkeuButton
                        type="submit"
                        size="sm"
                        variant="primary"
                        disabled={updatePending}
                      >
                        Guardar
                      </SkeuButton>
                      <SkeuButton
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                      >
                        Cancelar
                      </SkeuButton>
                    </div>
                  </form>
                ) : (
                  <>
                    <p className="text-sm text-text-primary">{note.content}</p>
                    <p className="mt-1 text-xs text-text-secondary">
                      {note.authorName} ·{" "}
                      {new Date(note.createdAt).toLocaleString("es-SV")}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <SkeuButton
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingId(note.id)}
                      >
                        Editar
                      </SkeuButton>
                      <form action={deleteAction}>
                        <input type="hidden" name="noteId" value={note.id} />
                        <input
                          type="hidden"
                          name="opportunityId"
                          value={opportunityId}
                        />
                        <SkeuButton
                          type="submit"
                          size="sm"
                          variant="danger"
                          disabled={deletePending}
                        >
                          Eliminar
                        </SkeuButton>
                      </form>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </SkeuCardContent>
    </SkeuCard>
  );
}
