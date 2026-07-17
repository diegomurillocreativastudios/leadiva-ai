"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { loginAction, type ActionState } from "@/features/auth/actions";
import { Label } from "@/components/ui/label";
import { SkeuButton } from "@/components/ui/skeu-button";
import {
  SkeuCard,
  SkeuCardContent,
  SkeuCardDescription,
  SkeuCardFooter,
  SkeuCardHeader,
  SkeuCardTitle,
} from "@/components/ui/skeu-card";
import { SkeuInput } from "@/components/ui/skeu-input";
import { SkeuToggle } from "@/components/ui/skeu-toggle";

const initialState: ActionState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <SkeuCard className="w-full max-w-md">
      <SkeuCardHeader>
        <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">
          Leadiva
        </p>
        <SkeuCardTitle className="text-xl">Iniciar sesión</SkeuCardTitle>
        <SkeuCardDescription>
          Acceso interno Creativa Studios
        </SkeuCardDescription>
      </SkeuCardHeader>
      <form action={formAction}>
        <SkeuCardContent className="space-y-4">
          {state.error ? (
            <p className="text-sm text-danger" role="alert">
              {state.error}
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="email">Correo electrónico</Label>
            <SkeuInput
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <SkeuInput
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
            />
          </div>
          <SkeuToggle
            id="showPassword"
            checked={showPassword}
            onCheckedChange={setShowPassword}
            label="Mostrar contraseña"
          />
        </SkeuCardContent>
        <SkeuCardFooter className="flex-col gap-3">
          <SkeuButton
            className="w-full"
            variant="primary"
            type="submit"
            disabled={pending}
          >
            {pending ? "Entrando…" : "Entrar"}
          </SkeuButton>
          <p className="text-sm text-text-secondary">
            ¿No tienes cuenta?{" "}
            <Link className="font-medium text-accent underline-offset-2 hover:underline" href="/register">
              Regístrate
            </Link>
          </p>
        </SkeuCardFooter>
      </form>
    </SkeuCard>
  );
}
