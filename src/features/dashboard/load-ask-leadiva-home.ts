import "server-only";

import {
  getUserSearchExecutionDetail,
  listUserSearchExecutions,
  MAX_USER_SEARCH_HISTORY_LIMIT,
} from "@/server/services/search-execution.service";
import { getUserProfile } from "@/server/services/auth.service";
import { splitDisplayName } from "@/lib/user-role-label";
import type { UserRole } from "@/server/db/schema/enums";
import type { ProfileUser } from "@/features/dashboard/user-profile-modal";
import type { PreviousSearchLink } from "@/components/shared/previous-search-item";
import type { SearchExecutionDetail } from "@/features/projects/search-execution-activity";

function previousSearchLabel(item: {
  query: string | null;
  profileName: string;
  createdAt: string;
}) {
  if (item.query) {
    return item.query;
  }

  const date = new Date(item.createdAt).toLocaleDateString("es-SV", {
    day: "2-digit",
    month: "short",
  });
  return `${item.profileName} · ${date}`;
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

  const detail = selectedExecutionId
    ? await getUserSearchExecutionDetail({
        executionId: selectedExecutionId,
        userId: params.userId,
      })
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
