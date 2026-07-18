import "server-only";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

import { isAllowedEmailDomain } from "@/env/server";
import type { RegisterInput } from "@/schemas/auth";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";

export class AuthServiceError extends Error {
  constructor(
    public readonly code: "DOMAIN_NOT_ALLOWED" | "EMAIL_TAKEN" | "VALIDATION",
    message: string,
  ) {
    super(message);
    this.name = "AuthServiceError";
  }
}

export async function registerUser(input: RegisterInput) {
  const email = input.email.toLowerCase().trim();

  if (!isAllowedEmailDomain(email)) {
    throw new AuthServiceError(
      "DOMAIN_NOT_ALLOWED",
      "No pudimos validar este correo. Revísalo e inténtalo de nuevo.",
    );
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    throw new AuthServiceError(
      "EMAIL_TAKEN",
      "Ya existe una cuenta con este correo.",
    );
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  const [created] = await db
    .insert(users)
    .values({
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email,
      passwordHash,
      role: "COMMERCIAL_ANALYST",
      interestCategories: [],
      isActive: true,
    })
    .returning({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
    });

  return created;
}
