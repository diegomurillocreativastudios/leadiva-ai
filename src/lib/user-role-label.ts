import type { UserRole } from "@/server/db/schema/enums";

const roleLabels = {
  ADMIN: "Administrador",
  USER: "Usuario",
} as const satisfies Record<UserRole, string>;

export function getUserRoleLabel(role: UserRole): string {
  return roleLabels[role];
}

export function getUserRoleDescription(role: UserRole): string {
  return `Tu cuenta tiene permisos de ${getUserRoleLabel(role)} para la plataforma Leadiva AI.`;
}

export function splitDisplayName(name: string): {
  firstName: string;
  lastName: string;
} {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: "", lastName: "" };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}
