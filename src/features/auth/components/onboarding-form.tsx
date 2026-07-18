"use client";

import { useActionState } from "react";

import { saveOnboardingAction, type ActionState } from "@/features/auth/actions";
import { interestCategories } from "@/server/db/schema/enums";
import { LeadivaBrand } from "@/components/shared/leadiva-logo";
import { SkeuButton } from "@/components/ui/skeu-button";
import {
  SkeuCard,
  SkeuCardContent,
  SkeuCardDescription,
  SkeuCardFooter,
  SkeuCardHeader,
  SkeuCardTitle,
} from "@/components/ui/skeu-card";
import { SkeuCheckboxRow } from "@/components/ui/skeu-toggle";

const labels: Record<(typeof interestCategories)[number], string> = {
  SOFTWARE: "Software",
  IT: "IT / Tecnología",
  CONSULTING: "Consultoría",
  AI: "Inteligencia Artificial",
};

const initialState: ActionState = {};

export function OnboardingForm({
  initialCategories = [],
}: {
  initialCategories?: string[];
}) {
  const [state, formAction, pending] = useActionState(
    saveOnboardingAction,
    initialState,
  );

  return (
    <SkeuCard className="w-full max-w-lg">
      <SkeuCardHeader>
        <LeadivaBrand size="sm" className="mb-2" />
        <SkeuCardTitle className="text-xl">¿Qué te interesa revisar?</SkeuCardTitle>
        <SkeuCardDescription>
          Elige una o más categorías para priorizar proyectos en el catálogo.
        </SkeuCardDescription>
      </SkeuCardHeader>
      <form action={formAction}>
        <SkeuCardContent className="space-y-3">
          {state.error ? (
            <p className="text-sm text-danger" role="alert">
              {state.error}
            </p>
          ) : null}
          {interestCategories.map((category) => (
            <SkeuCheckboxRow
              key={category}
              name="interestCategories"
              value={category}
              label={labels[category]}
              defaultChecked={initialCategories.includes(category)}
            />
          ))}
        </SkeuCardContent>
        <SkeuCardFooter>
          <SkeuButton
            type="submit"
            variant="primary"
            disabled={pending}
            className="w-full"
          >
            {pending ? "Guardando…" : "Guardar"}
          </SkeuButton>
        </SkeuCardFooter>
      </form>
    </SkeuCard>
  );
}
