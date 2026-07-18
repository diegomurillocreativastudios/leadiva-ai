import { notFound } from "next/navigation";
import { z } from "zod";

import { AskLeadivaHome } from "@/features/dashboard/ask-leadiva-home";
import { loadAskLeadivaHome } from "@/features/dashboard/load-ask-leadiva-home";
import { requireSession } from "@/server/auth/session";

const executionIdSchema = z.uuid();

export default async function SearchExecutionHomePage({
  params,
}: {
  params: Promise<{ executionId: string }>;
}) {
  const session = await requireSession();
  const { executionId: rawExecutionId } = await params;
  const parsed = executionIdSchema.safeParse(rawExecutionId);

  if (!parsed.success) {
    notFound();
  }

  const home = await loadAskLeadivaHome({
    userId: session.user.id,
    sessionName: session.user.name,
    sessionEmail: session.user.email,
    sessionRole: session.user.role,
    selectedExecutionId: parsed.data,
  });

  return (
    <AskLeadivaHome
      user={home.user}
      previousSearches={home.previousSearches}
      selectedExecutionId={home.selectedExecutionId}
      detail={home.detail}
    />
  );
}
