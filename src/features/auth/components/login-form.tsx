"use client";

import { useActionState, useId, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { loginAction, type ActionState } from "@/features/auth/actions";
import { LeadivaLogo } from "@/components/shared/leadiva-logo";
import { Label } from "@/components/ui/label";
import { SkeuButton } from "@/components/ui/skeu-button";
import { SkeuInput } from "@/components/ui/skeu-input";
import { SkeuToggle } from "@/components/ui/skeu-toggle";

const initialState: ActionState = {};

const inputClassName =
  "h-11 focus:border-accent focus:ring-1 focus:ring-accent " +
  "[&:-webkit-autofill]:[-webkit-box-shadow:0_0_0_1000px_var(--color-surface-raised)_inset] " +
  "[&:-webkit-autofill]:[-webkit-text-fill-color:var(--color-text-primary)]";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const [emailLocked, setEmailLocked] = useState(true);
  const [passwordLocked, setPasswordLocked] = useState(true);
  const errorId = useId();
  const hasError = Boolean(state.error);

  return (
    <div className="w-full">
      <div className="mb-5 flex flex-col items-center gap-2 text-center">
        <LeadivaLogo size="xl" tone="teal" priority className="size-36" />
        <p className="font-heading text-3xl font-bold tracking-tight text-text-primary">
          Leadiva{" "}
          <span className="text-accent-coral">AI</span>
        </p>
      </div>

      <div className="rounded-md border border-surface-border bg-surface-raised p-6 sm:p-7">
        <header className="mb-5 text-center">
          <h1 className="font-heading text-xl font-semibold tracking-tight text-text-primary">
            Iniciar sesión
          </h1>
        </header>

        <form
          action={formAction}
          className="space-y-5"
          autoComplete="off"
          noValidate
        >
          {hasError ? (
            <div
              id={errorId}
              role="alert"
              className="rounded-md border border-danger/25 bg-danger/5 px-3.5 py-2.5"
            >
              <p className="text-sm text-danger">{state.error}</p>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="email" className="font-semibold text-text-primary">
              Correo electrónico
            </Label>
            <SkeuInput
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="off"
              required
              readOnly={emailLocked}
              onFocus={() => setEmailLocked(false)}
              placeholder="Escribe tu correo electrónico"
              aria-invalid={hasError}
              aria-describedby={hasError ? errorId : undefined}
              className={inputClassName}
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
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              readOnly={passwordLocked}
              onFocus={() => setPasswordLocked(false)}
              placeholder="Escribe tu contraseña"
              aria-invalid={hasError}
              className={inputClassName}
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
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Verificando…
              </>
            ) : (
              "Entrar"
            )}
          </SkeuButton>
        </form>
      </div>

      <p className="mt-5 text-center text-sm text-text-secondary">
        ¿No tienes cuenta?{" "}
        <Link
          className="font-semibold text-accent transition-colors hover:underline"
          href="/register"
        >
          Regístrate
        </Link>
      </p>
    </div>
  );
}
