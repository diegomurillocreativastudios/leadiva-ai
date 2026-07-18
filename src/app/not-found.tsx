import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { SkeuButton } from "@/components/ui/skeu-button";

export default function RootNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-base p-6">
      <EmptyState
        title="Página no encontrada"
        description="La ruta que buscas no existe o ya no está disponible."
        action={
          <SkeuButton asChild variant="primary">
            <Link href="/">Ir a Leadiva</Link>
          </SkeuButton>
        }
      />
    </main>
  );
}
