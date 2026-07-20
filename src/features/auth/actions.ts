"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import {
  addNoteSchema,
  convertToLeadSchema,
  loginSchema,
  onboardingSchema,
  registerSchema,
  updateOpportunityStatusSchema,
  updateProfileSchema,
} from "@/schemas/auth";
import {
  assignLeadSchema,
  deleteNoteSchema,
  updateLeadDetailsSchema,
  updateNoteSchema,
} from "@/schemas/leads";
import {
  bulkConvertProjectsSchema,
  bulkDiscardProjectsSchema,
  discardProjectSchema,
} from "@/schemas/projects";
import { signIn, signOut, unstable_update } from "@/server/auth";
import { requireSession } from "@/server/auth/session";
import { validateAvatarDataUrl } from "@/lib/avatar-image";
import {
  AuthServiceError,
  registerUser,
  updateUserAvatar,
  updateUserProfile,
} from "@/server/services/auth.service";
import {
  addOpportunityNote,
  assignOpportunity,
  convertSearchResultToLead,
  convertSearchResultsToLeads,
  deleteOpportunityNote,
  discardSearchResult,
  discardSearchResults,
  updateOpportunityDetails,
  updateOpportunityNote,
  updateOpportunityStatus,
  updateUserInterests,
} from "@/server/services/opportunity.service";

export type ActionState = {
  error?: string;
  success?: string;
};

export async function registerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = registerSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  try {
    await registerUser(parsed.data);
  } catch (error) {
    if (error instanceof AuthServiceError) {
      return { error: error.message };
    }
    return { error: "No se pudo crear la cuenta" };
  }

  return {
    success: "Cuenta creada correctamente. Ya puedes iniciar sesión.",
  };
}

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Credenciales inválidas" };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Correo o contraseña incorrectos" };
    }
    throw error;
  }

  return { success: "ok" };
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function uploadAvatarAction(
  dataUrl: string,
): Promise<{ imageUrl?: string; error?: string }> {
  const session = await requireSession();
  const validated = validateAvatarDataUrl(dataUrl);

  if (!validated.ok) {
    return { error: validated.error };
  }

  try {
    const updated = await updateUserAvatar(session.user.id, validated.dataUrl);
    return { imageUrl: updated.imageUrl ?? validated.dataUrl };
  } catch {
    return { error: "No se pudo guardar la foto de perfil." };
  }
}

export async function updateProfileAction(input: {
  firstName: string;
  lastName: string;
}): Promise<{
  name?: string;
  firstName?: string;
  lastName?: string;
  error?: string;
  fieldErrors?: {
    firstName?: string;
    lastName?: string;
  };
}> {
  const session = await requireSession();
  const parsed = updateProfileSchema.safeParse(input);

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return {
      error: parsed.error.issues[0]?.message ?? "Datos de perfil inválidos",
      fieldErrors: {
        firstName: fieldErrors.firstName?.[0],
        lastName: fieldErrors.lastName?.[0],
      },
    };
  }

  try {
    const updated = await updateUserProfile(session.user.id, parsed.data);
    const name = `${updated.firstName} ${updated.lastName}`.trim();
    await unstable_update({
      user: { name },
    });
    return {
      name,
      firstName: updated.firstName,
      lastName: updated.lastName,
    };
  } catch {
    return { error: "No se pudo guardar el perfil." };
  }
}

export async function saveOnboardingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const raw = formData.getAll("interestCategories").map(String);
  const parsed = onboardingSchema.safeParse({ interestCategories: raw });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Selecciona categorías" };
  }

  await updateUserInterests(session.user.id, parsed.data.interestCategories);
  await unstable_update({
    user: {
      interestCategories: parsed.data.interestCategories,
    },
  });
  redirect("/");
}

export async function convertToLeadAction(formData: FormData) {
  const session = await requireSession();
  const parsed = convertToLeadSchema.safeParse({
    searchResultId: formData.get("searchResultId"),
    executionId: formData.get("executionId"),
  });
  if (!parsed.success) {
    throw new Error("Invalid id");
  }

  try {
    await convertSearchResultToLead({
      searchResultId: parsed.data.searchResultId,
      executionId: parsed.data.executionId,
      userId: session.user.id,
    });
    redirect("/");
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "RESULT_REJECTED" ||
        error.message === "RESULT_DISMISSED")
    ) {
      throw new Error("Este proyecto fue descartado y no puede convertirse");
    }
    if (error instanceof Error && error.message === "RESULT_NOT_VERIFIED") {
      throw new Error(
        "La fuente aún no cumple los mínimos de verificación para crear un Lead.",
      );
    }
    if (error instanceof Error && error.message === "RESULT_EXPIRED") {
      throw new Error("La oportunidad ya venció y no puede convertirse en Lead.");
    }
    if (error instanceof Error && error.message === "SOURCE_URL_UNREACHABLE") {
      throw new Error(
        "La convocatoria oficial no está accesible. No se puede convertir hasta validar el enlace.",
      );
    }
    if (error instanceof Error && error.message === "SOURCE_URL_NOT_SPECIFIC") {
      throw new Error(
        "La URL registrada es un índice o portal general. Se necesita el enlace directo de la convocatoria.",
      );
    }
    throw error;
  }
}

export async function discardProjectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const parsed = discardProjectSchema.safeParse({
    searchResultId: formData.get("searchResultId"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Motivo de descarte inválido",
    };
  }

  await discardSearchResult(
    parsed.data.searchResultId,
    session.user.id,
    parsed.data.reason,
  );
  redirect("/");
}

export async function bulkDiscardProjectsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ids = formData
    .getAll("searchResultIds")
    .map(String)
    .filter(Boolean);

  const parsed = bulkDiscardProjectsSchema.safeParse({
    searchResultIds: ids,
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ??
        "Selecciona proyectos y un motivo válido",
    };
  }

  const result = await discardSearchResults(
    parsed.data.searchResultIds,
    session.user.id,
    `${parsed.data.reason} (por ${session.user.email})`,
  );

  return {
    success: `${result.discarded} proyecto(s) descartado(s)`,
  };
}

export async function bulkConvertProjectsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ids = formData
    .getAll("searchResultIds")
    .map(String)
    .filter(Boolean);

  const parsed = bulkConvertProjectsSchema.safeParse({
    searchResultIds: ids,
  });

  if (!parsed.success) {
    return { error: "Selecciona al menos un proyecto válido" };
  }

  const result = await convertSearchResultsToLeads({
    searchResultIds: parsed.data.searchResultIds,
    userId: session.user.id,
  });

  if (result.leads.length === 0) {
    return {
      error:
        result.errors[0]?.error === "RESULT_REJECTED" ||
          result.errors[0]?.error === "RESULT_DISMISSED" ||
          result.errors[0]?.error === "RESULT_NOT_VERIFIED"
          ? "No se pudieron convertir (rechazados o inválidos)"
          : "No se pudieron convertir los proyectos seleccionados",
    };
  }

  if (result.leads.length === 1 && result.errors.length === 0) {
    redirect("/");
  }

  return {
    success: `${result.leads.length} lead(s) creado(s)${
      result.errors.length > 0 ? ` · ${result.errors.length} con error` : ""
    }`,
  };
}

export async function updateLeadStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const parsed = updateOpportunityStatusSchema.safeParse({
    opportunityId: formData.get("opportunityId"),
    status: formData.get("status"),
    reason: formData.get("reason") || undefined,
  });

  if (!parsed.success) {
    return { error: "Estado inválido" };
  }

  try {
    await updateOpportunityStatus({
      ...parsed.data,
      userId: session.user.id,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("INVALID_TRANSITION")) {
      return {
        error:
          "Transición no permitida. El pipeline solo avanza hacia etapas válidas o salidas (descartado / vencido / duplicado).",
      };
    }
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return { error: "Lead no encontrado" };
    }
    return { error: "No se pudo actualizar el estado" };
  }

  return { success: "Estado actualizado" };
}

export async function addLeadNoteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const parsed = addNoteSchema.safeParse({
    opportunityId: formData.get("opportunityId"),
    content: formData.get("content"),
  });

  if (!parsed.success) {
    return { error: "Nota inválida" };
  }

  await addOpportunityNote({
    ...parsed.data,
    userId: session.user.id,
  });

  return { success: "Nota agregada" };
}

export async function updateLeadNoteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const parsed = updateNoteSchema.safeParse({
    noteId: formData.get("noteId"),
    opportunityId: formData.get("opportunityId"),
    content: formData.get("content"),
  });

  if (!parsed.success) {
    return { error: "Nota inválida" };
  }

  try {
    await updateOpportunityNote({
      ...parsed.data,
      userId: session.user.id,
    });
  } catch {
    return { error: "No se pudo actualizar la nota" };
  }

  return { success: "Nota actualizada" };
}

export async function deleteLeadNoteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const parsed = deleteNoteSchema.safeParse({
    noteId: formData.get("noteId"),
    opportunityId: formData.get("opportunityId"),
  });

  if (!parsed.success) {
    return { error: "Nota inválida" };
  }

  try {
    await deleteOpportunityNote(parsed.data);
  } catch {
    return { error: "No se pudo eliminar la nota" };
  }

  return { success: "Nota eliminada" };
}

export async function assignLeadAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const parsed = assignLeadSchema.safeParse({
    opportunityId: formData.get("opportunityId"),
    assignedToUserId: formData.get("assignedToUserId") ?? "",
  });

  if (!parsed.success) {
    return { error: "Asignación inválida" };
  }

  try {
    await assignOpportunity({
      opportunityId: parsed.data.opportunityId,
      assignedToUserId: parsed.data.assignedToUserId || null,
      userId: session.user.id,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ASSIGNEE_NOT_FOUND") {
      return { error: "Usuario asignado no encontrado" };
    }
    return { error: "No se pudo asignar el lead" };
  }

  return { success: "Responsable actualizado" };
}

export async function updateLeadDetailsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const parsed = updateLeadDetailsSchema.safeParse({
    opportunityId: formData.get("opportunityId"),
    nextAction: formData.get("nextAction") ?? undefined,
    nextActionAt: formData.get("nextActionAt") ?? undefined,
    deadlineAt: formData.get("deadlineAt") ?? undefined,
    estimatedAmount: formData.get("estimatedAmount") ?? undefined,
    currency: formData.get("currency") ?? undefined,
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Datos comerciales inválidos",
    };
  }

  const toDateOrNull = (value: string | undefined) => {
    if (value === undefined) {
      return undefined;
    }
    if (value === "") {
      return null;
    }
    return new Date(value);
  };

  const amountRaw = parsed.data.estimatedAmount;
  let estimatedAmount: string | null | undefined = undefined;
  if (amountRaw !== undefined) {
    if (amountRaw === "") {
      estimatedAmount = null;
    } else {
      const amount = Number(amountRaw);
      if (Number.isNaN(amount) || amount < 0) {
        return { error: "Monto estimado inválido" };
      }
      estimatedAmount = amount.toFixed(2);
    }
  }

  try {
    await updateOpportunityDetails({
      opportunityId: parsed.data.opportunityId,
      nextAction: parsed.data.nextAction,
      nextActionAt: toDateOrNull(parsed.data.nextActionAt),
      deadlineAt: toDateOrNull(parsed.data.deadlineAt),
      estimatedAmount,
      currency:
        parsed.data.currency === undefined
          ? undefined
          : parsed.data.currency || null,
    });
  } catch {
    return { error: "No se pudieron guardar los datos del lead" };
  }

  return { success: "Datos del lead actualizados" };
}
