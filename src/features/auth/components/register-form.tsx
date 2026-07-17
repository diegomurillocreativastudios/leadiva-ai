"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { registerAction, type ActionState } from "@/features/auth/actions";
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

type RegisterFields = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
};

const emptyFields: RegisterFields = {
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  confirmPassword: "",
};

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(
    registerAction,
    initialState,
  );
  const [showPassword, setShowPassword] = useState(false);
  const [fields, setFields] = useState<RegisterFields>(emptyFields);
  const passwordInputType = showPassword ? "text" : "password";

  function updateField<K extends keyof RegisterFields>(
    key: K,
    value: RegisterFields[K],
  ) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  return (
    <SkeuCard className="w-full max-w-md">
      <SkeuCardHeader>
        <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">
          Leadiva
        </p>
        <SkeuCardTitle className="text-xl">Crear cuenta</SkeuCardTitle>
        <SkeuCardDescription>
          Acceso interno para el equipo de Creativa Studios.
        </SkeuCardDescription>
      </SkeuCardHeader>
      <form action={formAction}>
        <SkeuCardContent className="space-y-4">
          {state.error ? (
            <p className="text-sm text-danger" role="alert">
              {state.error}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="firstName">Nombres</Label>
              <SkeuInput
                id="firstName"
                name="firstName"
                required
                value={fields.firstName}
                onChange={(event) =>
                  updateField("firstName", event.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Apellidos</Label>
              <SkeuInput
                id="lastName"
                name="lastName"
                required
                value={fields.lastName}
                onChange={(event) => updateField("lastName", event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Correo electrónico</Label>
            <SkeuInput
              id="email"
              name="email"
              type="email"
              required
              value={fields.email}
              onChange={(event) => updateField("email", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <SkeuInput
              id="password"
              name="password"
              type={passwordInputType}
              minLength={8}
              required
              autoComplete="new-password"
              value={fields.password}
              onChange={(event) => updateField("password", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
            <SkeuInput
              id="confirmPassword"
              name="confirmPassword"
              type={passwordInputType}
              minLength={8}
              required
              autoComplete="new-password"
              value={fields.confirmPassword}
              onChange={(event) =>
                updateField("confirmPassword", event.target.value)
              }
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
            {pending ? "Creando…" : "Registrarme"}
          </SkeuButton>
          <p className="text-sm text-text-secondary">
            ¿Ya tienes cuenta?{" "}
            <Link className="font-medium text-accent underline-offset-2 hover:underline" href="/login">
              Inicia sesión
            </Link>
          </p>
        </SkeuCardFooter>
      </form>
    </SkeuCard>
  );
}
