import Link from "next/link";
import { Activity } from "lucide-react";

import { SkeuButton } from "@/components/ui/skeu-button";
import { homeSearchHref } from "@/lib/home-search-href";

export function searchActivityHref(executionId?: string): string {
  return homeSearchHref(executionId);
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
