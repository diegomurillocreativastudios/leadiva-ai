import { CircleAlert, CircleCheck, Loader2 } from "lucide-react";

export function searchStatusLabel(status: string): string {
  switch (status) {
    case "COMPLETED":
      return "Completado";
    case "PARTIALLY_COMPLETED":
      return "Parcial";
    case "RUNNING":
    case "PENDING":
      return "En progreso";
    case "FAILED":
      return "Error";
    case "CANCELLED":
      return "Cancelado";
    default:
      return status;
  }
}

export function SearchStatusIcon({ status }: { status: string }) {
  if (status === "RUNNING" || status === "PENDING") {
    return <Loader2 className="size-3.5 animate-spin text-accent" aria-hidden />;
  }
  if (status === "FAILED") {
    return <CircleAlert className="size-3.5 text-danger" aria-hidden />;
  }
  return <CircleCheck className="size-3.5 text-status-won" aria-hidden />;
}
