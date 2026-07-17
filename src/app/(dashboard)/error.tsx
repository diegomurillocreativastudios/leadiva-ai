"use client";

import { PageError } from "@/components/shared/page-error";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageError
      title="No se pudo cargar el panel"
      description="Ocurrió un error inesperado. Puedes reintentar sin perder tu sesión."
      reset={reset}
    />
  );
}
