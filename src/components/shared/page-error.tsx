"use client";

import { SkeuButton } from "@/components/ui/skeu-button";
import { SkeuCard, SkeuCardContent } from "@/components/ui/skeu-card";

export function PageError({
  title = "Algo salió mal",
  description = "No pudimos cargar esta vista. Intenta de nuevo.",
  reset,
}: {
  title?: string;
  description?: string;
  reset?: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <SkeuCard className="w-full max-w-md">
        <SkeuCardContent className="space-y-4 py-8 text-center">
          <h2 className="font-heading text-lg font-semibold text-text-primary">
            {title}
          </h2>
          <p className="text-sm text-text-secondary">{description}</p>
          {reset ? (
            <SkeuButton type="button" variant="primary" onClick={reset}>
              Reintentar
            </SkeuButton>
          ) : null}
        </SkeuCardContent>
      </SkeuCard>
    </div>
  );
}
