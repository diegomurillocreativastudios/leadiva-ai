import "server-only";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { isAllowedEmailDomain } from "@/env/server";
import { loginSchema } from "@/schemas/auth";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import type { UserRole } from "@/server/db/schema/enums";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: UserRole;
      interestCategories: string[];
    };
  }

  interface User {
    role: UserRole;
    interestCategories: string[];
  }
}

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse({
          email: credentials?.email,
          password: credentials?.password,
        });
        if (!parsed.success) {
          return null;
        }

        const email = parsed.data.email.toLowerCase();
        if (!isAllowedEmailDomain(email)) {
          return null;
        }

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user || !user.isActive) {
          return null;
        }

        const valid = await bcrypt.compare(
          parsed.data.password,
          user.passwordHash,
        );
        if (!valid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role as UserRole,
          interestCategories: user.interestCategories ?? [],
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.interestCategories = user.interestCategories;
        token.name = user.name;
        token.email = user.email;
      }

      if (trigger === "update" && session) {
        const updatePayload = session as {
          user?: { interestCategories?: string[] };
          interestCategories?: string[];
        };
        const categories =
          updatePayload.user?.interestCategories ??
          updatePayload.interestCategories;
        if (Array.isArray(categories)) {
          token.interestCategories = categories;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id ?? "");
        session.user.role = (token.role as UserRole) ?? "VIEWER";
        session.user.interestCategories = Array.isArray(
          token.interestCategories,
        )
          ? (token.interestCategories as string[])
          : [];
        session.user.email = String(token.email ?? "");
        session.user.name = String(token.name ?? "");
      }
      return session;
    },
  },
});
