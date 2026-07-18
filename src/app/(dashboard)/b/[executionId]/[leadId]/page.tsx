import { notFound } from "next/navigation";
import { z } from "zod";

import { AskLeadivaHome } from "@/features/dashboard/ask-leadiva-home";
import { loadAskLeadivaHome } from "@/features/dashboard/load-ask-leadiva-home";
import {
  buildHomeSearchResultDetail,
  buildHomeSearchResultDetailFromCandidate,
} from "@/lib/home-search-result-detail";
import { requireSession } from "@/server/auth/session";
import { getUserSearchExecutionResultDetail } from "@/server/services/search-execution.service";

const executionIdSchema = z.uuid();
const leadKeySchema = z.string().trim().min(1).max(200);

export default async function SearchExecutionLeadDetailPage({
  params,
}: {
  params: Promise<{ executionId: string; leadId: string }>;
}) {
  const session = await requireSession();
  const { executionId: rawExecutionId, leadId: rawLeadId } = await params;
  const executionId = executionIdSchema.safeParse(rawExecutionId);
  const leadKey = leadKeySchema.safeParse(rawLeadId);

  if (!executionId.success || !leadKey.success) {
    notFound();
  }

  const home = await loadAskLeadivaHome({
    userId: session.user.id,
    sessionName: session.user.name,
    sessionEmail: session.user.email,
    sessionRole: session.user.role,
    selectedExecutionId: executionId.data,
  });

  if (!home.detail) {
    notFound();
  }

  const uuidLead = z.uuid().safeParse(leadKey.data);
  if (uuidLead.success) {
    const result = await getUserSearchExecutionResultDetail({
      executionId: executionId.data,
      leadId: uuidLead.data,
      userId: session.user.id,
    });

    if (result) {
      return (
        <AskLeadivaHome
          user={home.user}
          previousSearches={home.previousSearches}
          selectedExecutionId={home.selectedExecutionId}
          detail={home.detail}
          selectedLead={buildHomeSearchResultDetail(result)}
        />
      );
    }
  }

  const candidate = home.detail.candidates.find(
    (item) =>
      item.searchResultId === leadKey.data ||
      item.temporaryId === leadKey.data,
  );

  if (!candidate) {
    notFound();
  }

  return (
    <AskLeadivaHome
      user={home.user}
      previousSearches={home.previousSearches}
      selectedExecutionId={home.selectedExecutionId}
      detail={home.detail}
      selectedLead={buildHomeSearchResultDetailFromCandidate(candidate)}
    />
  );
}
