import * as React from "react";

import { cn } from "@/lib/utils";

function SkeuInput({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="skeu-input"
      className={cn(
        "h-11 w-full min-w-0 rounded-md bg-surface-raised px-4 py-3",
        "border border-surface-border text-base text-text-primary md:text-sm",
        "placeholder:text-text-secondary",
        "transition-colors duration-150 ease-out",
        "focus:outline-none focus:ring-2 focus:ring-accent/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:ring-2 aria-invalid:ring-danger/40",
        className,
      )}
      {...props}
    />
  );
}

function SkeuTextarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="skeu-textarea"
      className={cn(
        "flex min-h-24 w-full rounded-md bg-surface-raised px-4 py-3",
        "border border-surface-border text-base text-text-primary md:text-sm",
        "placeholder:text-text-secondary",
        "transition-colors duration-150 ease-out",
        "focus:outline-none focus:ring-2 focus:ring-accent/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:ring-2 aria-invalid:ring-danger/40",
        className,
      )}
      {...props}
    />
  );
}

export { SkeuInput, SkeuTextarea };
