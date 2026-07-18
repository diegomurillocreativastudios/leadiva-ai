import "server-only";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

import { isAllowedEmailDomain } from "@/env/server";
import type { RegisterInput, UpdateProfileInput } from "@/schemas/auth";
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
      role: "USER",
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

export async function getUserProfile(userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      role: users.role,
      imageUrl: users.imageUrl,
      interestCategories: users.interestCategories,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user ?? null;
}

export async function updateUserAvatar(userId: string, imageUrl: string) {
  const [updated] = await db
    .update(users)
    .set({
      imageUrl,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      imageUrl: users.imageUrl,
    });

  if (!updated) {
    throw new AuthServiceError("VALIDATION", "Usuario no encontrado.");
  }

  return updated;
}

export async function updateUserProfile(
  userId: string,
  input: UpdateProfileInput,
) {
  const [updated] = await db
    .update(users)
    .set({
      firstName: input.firstName,
      lastName: input.lastName,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      imageUrl: users.imageUrl,
    });

  if (!updated) {
    throw new AuthServiceError("VALIDATION", "Usuario no encontrado.");
  }

  return updated;
}
