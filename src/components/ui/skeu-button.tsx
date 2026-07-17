import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const skeuButtonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-md",
    "border border-surface-border text-sm font-medium whitespace-nowrap",
    "transition-colors duration-150 ease-out select-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-surface-raised text-text-primary hover:bg-surface-pressed",
        primary:
          "border-accent bg-accent text-white hover:bg-accent-dark",
        outline:
          "bg-surface-raised text-text-primary hover:bg-accent-mint/60",
        ghost:
          "border-transparent bg-transparent text-text-secondary shadow-none hover:bg-surface-pressed hover:text-text-primary",
        danger:
          "border-danger/30 bg-danger/10 text-danger hover:bg-danger/15",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 px-6",
        icon: "size-10",
        "icon-sm": "size-8 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function SkeuButton({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof skeuButtonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="skeu-button"
      className={cn(skeuButtonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { SkeuButton, skeuButtonVariants };
