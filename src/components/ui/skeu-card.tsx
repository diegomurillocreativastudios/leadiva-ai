import * as React from "react";

import { cn } from "@/lib/utils";

function SkeuCard({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeu-card"
      className={cn(
        "relative overflow-hidden rounded-md bg-surface-raised text-text-primary",
        "border border-surface-border",
        className,
      )}
      {...props}
    />
  );
}

function SkeuCardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeu-card-header"
      className={cn("relative space-y-1 px-5 pt-5 pb-2", className)}
      {...props}
    />
  );
}

function SkeuCardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="skeu-card-title"
      className={cn(
        "font-heading text-base font-semibold tracking-tight",
        className,
      )}
      {...props}
    />
  );
}

function SkeuCardDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="skeu-card-description"
      className={cn("text-sm text-text-secondary", className)}
      {...props}
    />
  );
}

function SkeuCardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeu-card-content"
      className={cn("relative px-5 py-4", className)}
      {...props}
    />
  );
}

function SkeuCardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeu-card-footer"
      className={cn(
        "relative flex items-center gap-3 border-t border-surface-border px-5 py-4",
        className,
      )}
      {...props}
    />
  );
}

export {
  SkeuCard,
  SkeuCardHeader,
  SkeuCardTitle,
  SkeuCardDescription,
  SkeuCardContent,
  SkeuCardFooter,
};
