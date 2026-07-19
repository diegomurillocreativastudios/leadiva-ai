import "server-only";

import {
  getUserSearchExecutionDetail,
  listUserSearchExecutions,
  MAX_USER_SEARCH_HISTORY_LIMIT,
} from "@/server/services/search-execution.service";
import { getUserProfile } from "@/server/services/auth.service";
import { enrichComprasalListDeadlines } from "@/lib/enrich-comprasal-list-deadlines";
import { buildSearchExecutionTitle } from "@/lib/search-execution-title";
import { splitDisplayName } from "@/lib/user-role-label";
import type { UserRole } from "@/server/db/schema/enums";
import type { ProfileUser } from "@/features/dashboard/user-profile-modal";
import type { PreviousSearchLink } from "@/components/shared/previous-search-item";
import type { SearchExecutionDetail } from "@/features/projects/search-execution-activity";

function previousSearchLabel(item: {
  query: string | null;
  sourceType: string;
  profileName: string;
  createdAt: string;
}) {
  const formatted = buildSearchExecutionTitle({
    userQuery: item.query,
    sourceType: item.sourceType,
    at: item.createdAt,
  });
  if (formatted) {
    return formatted;
  }

  return (
    buildSearchExecutionTitle({
      userQuery: item.profileName,
      sourceType: item.sourceType,
      at: item.createdAt,
    }) ?? item.profileName
  );
}

export async function loadAskLeadivaHome(params: {
  userId: string;
  sessionName: string;
  sessionEmail: string;
  sessionRole: UserRole;
  selectedExecutionId?: string | null;
}): Promise<{
  user: ProfileUser;
  previousSearches: PreviousSearchLink[];
  selectedExecutionId: string | null;
  detail: SearchExecutionDetail | null;
}> {
  const selectedExecutionId = params.selectedExecutionId ?? null;

  const [profile, executions] = await Promise.all([
    getUserProfile(params.userId),
    listUserSearchExecutions({
      userId: params.userId,
      limit: MAX_USER_SEARCH_HISTORY_LIMIT,
    }),
  ]);

  const loadedDetail = selectedExecutionId
    ? await getUserSearchExecutionDetail({
        executionId: selectedExecutionId,
        userId: params.userId,
      })
    : null;
  const detail = loadedDetail
    ? await enrichComprasalListDeadlines(loadedDetail)
    : null;

  const fallbackName = splitDisplayName(params.sessionName);
  const firstName = profile?.firstName ?? fallbackName.firstName;
  const lastName = profile?.lastName ?? fallbackName.lastName;
  const name = profile
    ? `${profile.firstName} ${profile.lastName}`.trim()
    : params.sessionName;

  return {
    user: {
      name,
      firstName,
      lastName,
      email: profile?.email ?? params.sessionEmail,
      role: (profile?.role as UserRole | undefined) ?? params.sessionRole,
      imageUrl: profile?.imageUrl ?? null,
    },
    previousSearches: executions.map((item) => ({
      id: item.id,
      label: previousSearchLabel(item),
    })),
    selectedExecutionId,
    detail,
  };
}
