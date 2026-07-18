"use server";

import { revalidatePath } from "next/cache";

import {
  deleteSearchExecutionSchema,
  renameSearchExecutionSchema,
} from "@/schemas/search-history";
import { requireSession } from "@/server/auth/session";
import {
  hideUserSearchExecutionFromHistory,
  renameUserSearchExecution,
} from "@/server/services/search-execution.service";

export type SearchHistoryActionResult =
  | { ok: true; title?: string }
  | { ok: false; error: string };

export async function renameSearchExecutionAction(input: {
  executionId: string;
  title: string;
}): Promise<SearchHistoryActionResult> {
  const session = await requireSession();
  const parsed = renameSearchExecutionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Nombre inválido",
    };
  }

  const result = await renameUserSearchExecution({
    executionId: parsed.data.executionId,
    userId: session.user.id,
    title: parsed.data.title,
  });

  if (!result) {
    return { ok: false, error: "No se encontró esa búsqueda" };
  }

  revalidatePath("/");
  revalidatePath("/b", "layout");
  return { ok: true, title: result.title };
}

export async function deleteSearchExecutionAction(input: {
  executionId: string;
}): Promise<SearchHistoryActionResult> {
  const session = await requireSession();
  const parsed = deleteSearchExecutionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Búsqueda inválida" };
  }

  const result = await hideUserSearchExecutionFromHistory({
    executionId: parsed.data.executionId,
    userId: session.user.id,
  });

  if (!result) {
    return { ok: false, error: "No se encontró esa búsqueda" };
  }

  revalidatePath("/");
  revalidatePath("/b", "layout");
  return { ok: true };
}
