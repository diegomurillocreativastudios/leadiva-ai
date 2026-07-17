"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import {
  assignLeadAction,
  updateLeadDetailsAction,
  updateLeadStatusAction,
  type ActionState,
} from "@/features/auth/actions";
import { Label } from "@/components/ui/label";
import { SkeuButton } from "@/components/ui/skeu-button";
import {
  SkeuCard,
  SkeuCardContent,
  SkeuCardHeader,
  SkeuCardTitle,
} from "@/components/ui/skeu-card";
import { SkeuInput, SkeuTextarea } from "@/components/ui/skeu-input";
import {
  getAllowedOpportunityTransitions,
  isOpportunityStatus,
  opportunityStatusLabels,
} from "@/lib/lead-pipeline";
import { useActionToast } from "@/lib/use-action-toast";

const initial: ActionState = {};

const selectClassName =
  "h-11 w-full rounded-md border border-surface-border bg-surface-raised px-4 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40";

function toDateTimeLocal(value: Date | string | null | undefined) {
  if (!value) {
    return "";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function LeadActions({
  opportunityId,
  currentStatus,
  assignedToUserId,
  nextAction,
  nextActionAt,
  deadlineAt,
  estimatedAmount,
  currency,
  assignees,
}: {
  opportunityId: string;
  currentStatus: string;
  assignedToUserId: string | null;
  nextAction: string | null;
  nextActionAt: Date | null;
  deadlineAt: Date | null;
  estimatedAmount: string | null;
  currency: string | null;
  assignees: Array<{
    id: string;
    firstName: string;
    lastName: string;
  }>;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();

  const [statusState, statusAction, statusPending] = useActionState(
    updateLeadStatusAction,
    initial,
  );
  const [assignState, assignAction, assignPending] = useActionState(
    assignLeadAction,
    initial,
  );
  const [detailsState, detailsAction, detailsPending] = useActionState(
    updateLeadDetailsAction,
    initial,
  );

  useActionToast(statusState, refresh);
  useActionToast(assignState, refresh);
  useActionToast(detailsState, refresh);

  const allowed = isOpportunityStatus(currentStatus)
    ? getAllowedOpportunityTransitions(currentStatus)
    : [];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <SkeuCard>
        <SkeuCardHeader>
          <SkeuCardTitle>Cambiar estado</SkeuCardTitle>
        </SkeuCardHeader>
        <SkeuCardContent>
          <form action={statusAction} className="space-y-3">
            <input type="hidden" name="opportunityId" value={opportunityId} />
            <div className="space-y-2">
              <Label htmlFor="status">Estado</Label>
              <select
                id="status"
                name="status"
                defaultValue={allowed[0] ?? currentStatus}
                disabled={allowed.length === 0}
                className={selectClassName}
              >
                {allowed.length === 0 ? (
                  <option value={currentStatus}>
                    {isOpportunityStatus(currentStatus)
                      ? opportunityStatusLabels[currentStatus]
                      : currentStatus}{" "}
                    (final)
                  </option>
                ) : (
                  allowed.map((status) => (
                    <option key={status} value={status}>
                      {opportunityStatusLabels[status]}
                    </option>
                  ))
                )}
              </select>
              <p className="text-xs text-text-secondary">
                Actual:{" "}
                {isOpportunityStatus(currentStatus)
                  ? opportunityStatusLabels[currentStatus]
                  : currentStatus}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Motivo (opcional)</Label>
              <SkeuTextarea id="reason" name="reason" rows={3} />
            </div>
            <SkeuButton
              type="submit"
              variant="primary"
              disabled={statusPending || allowed.length === 0}
            >
              {statusPending ? "Guardando…" : "Guardar estado"}
            </SkeuButton>
          </form>
        </SkeuCardContent>
      </SkeuCard>

      <SkeuCard>
        <SkeuCardHeader>
          <SkeuCardTitle>Responsable</SkeuCardTitle>
        </SkeuCardHeader>
        <SkeuCardContent>
          <form action={assignAction} className="space-y-3">
            <input type="hidden" name="opportunityId" value={opportunityId} />
            <div className="space-y-2">
              <Label htmlFor="assignedToUserId">Asignar a</Label>
              <select
                id="assignedToUserId"
                name="assignedToUserId"
                defaultValue={assignedToUserId ?? ""}
                className={selectClassName}
              >
                <option value="">Sin asignar</option>
                {assignees.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.firstName} {user.lastName}
                  </option>
                ))}
              </select>
            </div>
            <SkeuButton type="submit" variant="primary" disabled={assignPending}>
              {assignPending ? "Guardando…" : "Guardar responsable"}
            </SkeuButton>
          </form>
        </SkeuCardContent>
      </SkeuCard>

      <SkeuCard className="lg:col-span-2">
        <SkeuCardHeader>
          <SkeuCardTitle>Datos comerciales</SkeuCardTitle>
        </SkeuCardHeader>
        <SkeuCardContent>
          <form
            action={detailsAction}
            className="grid gap-3 md:grid-cols-2"
          >
            <input type="hidden" name="opportunityId" value={opportunityId} />
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="nextAction">Próxima acción</Label>
              <SkeuTextarea
                id="nextAction"
                name="nextAction"
                rows={2}
                defaultValue={nextAction ?? ""}
                placeholder="Ej. Solicitar TDR, coordinar kickoff…"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nextActionAt">Fecha próxima acción</Label>
              <SkeuInput
                id="nextActionAt"
                name="nextActionAt"
                type="datetime-local"
                defaultValue={toDateTimeLocal(nextActionAt)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deadlineAt">Deadline</Label>
              <SkeuInput
                id="deadlineAt"
                name="deadlineAt"
                type="datetime-local"
                defaultValue={toDateTimeLocal(deadlineAt)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="estimatedAmount">Monto estimado</Label>
              <SkeuInput
                id="estimatedAmount"
                name="estimatedAmount"
                inputMode="decimal"
                defaultValue={estimatedAmount ?? ""}
                placeholder="15000.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Moneda</Label>
              <SkeuInput
                id="currency"
                name="currency"
                maxLength={3}
                defaultValue={currency ?? ""}
                placeholder="USD"
              />
            </div>
            <div className="md:col-span-2">
              <SkeuButton
                type="submit"
                variant="primary"
                disabled={detailsPending}
              >
                {detailsPending ? "Guardando…" : "Guardar datos"}
              </SkeuButton>
            </div>
          </form>
        </SkeuCardContent>
      </SkeuCard>
    </div>
  );
}
