import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function ExternalLink({
  className,
  children,
  ...props
}: ComponentProps<"a">) {
  return (
    <a
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "font-medium text-accent underline-offset-2 hover:underline",
        className,
      )}
      {...props}
    >
      {children}
    </a>
  );
}
