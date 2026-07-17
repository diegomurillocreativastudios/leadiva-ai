import "server-only";

import { redirect } from "next/navigation";

import { auth } from "@/server/auth";
import type { UserRole } from "@/server/db/schema/enums";

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  return session;
}

export async function requireRole(allowedRoles: UserRole[]) {
  const session = await requireSession();
  if (!allowedRoles.includes(session.user.role)) {
    redirect("/home");
  }
  return session;
}
