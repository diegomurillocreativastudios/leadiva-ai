import Link from "next/link";
import { Activity } from "lucide-react";

import { SkeuButton } from "@/components/ui/skeu-button";

export function searchActivityHref(executionId?: string): string {
  return executionId
    ? `/activity?execution=${encodeURIComponent(executionId)}`
    : "/activity";
}

export function SearchActivityTrigger({
  executionId,
  label = "Ver última búsqueda",
}: {
  executionId?: string;
  label?: string;
}) {
  return (
    <SkeuButton asChild variant="outline">
      <Link href={searchActivityHref(executionId)} prefetch={false}>
        <Activity aria-hidden />
        {label}
      </Link>
    </SkeuButton>
  );
}
