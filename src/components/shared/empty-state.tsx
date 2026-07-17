import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { SkeuCard, SkeuCardContent } from "@/components/ui/skeu-card";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <SkeuCard className={cn("border-dashed", className)}>
      <SkeuCardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-base font-medium text-text-primary">{title}</p>
        {description ? (
          <p className="max-w-md text-sm text-text-secondary">{description}</p>
        ) : null}
        {action ? <div className="mt-2">{action}</div> : null}
      </SkeuCardContent>
    </SkeuCard>
  );
}
