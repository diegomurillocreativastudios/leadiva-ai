"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { registerAction, type ActionState } from "@/features/auth/actions";
import { LeadivaBrand } from "@/components/shared/leadiva-logo";
import { Label } from "@/components/ui/label";
import { SkeuButton } from "@/components/ui/skeu-button";
import { SkeuInput } from "@/components/ui/skeu-input";
import { SkeuToggle } from "@/components/ui/skeu-toggle";
import { useActionToast } from "@/lib/use-action-toast";

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
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    registerAction,
    initialState,
  );
  const [showPassword, setShowPassword] = useState(false);
  const [fields, setFields] = useState<RegisterFields>(emptyFields);
  const passwordInputType = showPassword ? "text" : "password";

  useActionToast(state, () => {
    router.push("/login");
  });

  function updateField<K extends keyof RegisterFields>(
    key: K,
    value: RegisterFields[K],
  ) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="w-full">
      <LeadivaBrand
        size="xl"
        orientation="horizontal"
        priority
        className="mb-6 w-full justify-center gap-4 [&_[role=img]]:size-20 sm:[&_[role=img]]:size-24 [&>span]:text-4xl sm:[&>span]:text-5xl"
      />

      <div className="rounded-md border border-surface-border bg-surface-raised p-6 sm:p-7">
        <header className="mb-5 text-center">
          <h1 className="font-heading text-xl font-semibold tracking-tight text-text-primary">
            Crear cuenta
          </h1>
        </header>

        <form action={formAction} className="space-y-5">
          {state.error ? (
            <div
              role="alert"
              className="rounded-md border border-danger/25 bg-danger/5 px-3.5 py-2.5"
            >
              <p className="text-sm text-danger">{state.error}</p>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label
                htmlFor="firstName"
                className="font-semibold text-text-primary"
              >
                Nombres
              </Label>
              <SkeuInput
                id="firstName"
                name="firstName"
                required
                value={fields.firstName}
                onChange={(event) =>
                  updateField("firstName", event.target.value)
                }
                className="h-11 focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="lastName"
                className="font-semibold text-text-primary"
              >
                Apellidos
              </Label>
              <SkeuInput
                id="lastName"
                name="lastName"
                required
                value={fields.lastName}
                onChange={(event) =>
                  updateField("lastName", event.target.value)
                }
                className="h-11 focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email" className="font-semibold text-text-primary">
              Correo electrónico
            </Label>
            <SkeuInput
              id="email"
              name="email"
              type="email"
              required
              value={fields.email}
              onChange={(event) => updateField("email", event.target.value)}
              className="h-11 focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="password"
              className="font-semibold text-text-primary"
            >
              Contraseña
            </Label>
            <SkeuInput
              id="password"
              name="password"
              type={passwordInputType}
              minLength={8}
              required
              autoComplete="new-password"
              value={fields.password}
              onChange={(event) => updateField("password", event.target.value)}
              className="h-11 focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="confirmPassword"
              className="font-semibold text-text-primary"
            >
              Confirmar contraseña
            </Label>
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
              className="h-11 focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          <SkeuToggle
            id="showPassword"
            checked={showPassword}
            onCheckedChange={setShowPassword}
            label="Mostrar contraseña"
          />

          <SkeuButton
            className="mt-1 h-11 w-full font-bold"
            variant="primary"
            size="lg"
            type="submit"
            disabled={pending}
          >
            {pending ? "Creando…" : "Registrarme"}
          </SkeuButton>
        </form>
      </div>

      <p className="mt-5 text-center text-sm text-text-secondary">
        ¿Ya tienes cuenta?{" "}
        <Link
          className="font-semibold text-accent transition-colors hover:underline"
          href="/login"
        >
          Inicia sesión
        </Link>
      </p>
    </div>
  );
}
