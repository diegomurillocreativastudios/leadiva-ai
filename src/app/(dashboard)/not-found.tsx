import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { SkeuButton } from "@/components/ui/skeu-button";

export default function DashboardNotFound() {
  return (
    <EmptyState
      title="Página no encontrada"
      description="La ruta que buscas no existe o ya no está disponible."
      action={
        <SkeuButton asChild variant="primary">
          <Link href="/">Volver al inicio</Link>
        </SkeuButton>
      }
    />
  );
}
