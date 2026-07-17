"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

import type { ActionState } from "@/features/auth/actions";

/**
 * Shows a toast when a server action finishes.
 * onSuccess is read from a ref so identity changes do not re-fire
 * router.refresh() (avoids reload loops with loading UI).
 */
export function useActionToast(
  state: ActionState,
  onSuccess?: () => void,
): void {
  const lastRef = useRef<string | null>(null);
  const onSuccessRef = useRef(onSuccess);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  useEffect(() => {
    const key = `${state.error ?? ""}|${state.success ?? ""}`;
    if (!state.error && !state.success) {
      return;
    }
    if (lastRef.current === key) {
      return;
    }
    lastRef.current = key;

    if (state.error) {
      toast.error(state.error);
      return;
    }

    if (state.success) {
      toast.success(state.success);
      onSuccessRef.current?.();
    }
  }, [state.error, state.success]);
}
