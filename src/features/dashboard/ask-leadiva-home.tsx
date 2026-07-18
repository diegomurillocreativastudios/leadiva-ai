import { AskLeadivaPrompt } from "@/features/dashboard/ask-leadiva-prompt";
import { HomeSearchResultDetail } from "@/features/dashboard/home-search-result-detail";
import { HomeSearchResults } from "@/features/dashboard/home-search-results";
import type { ProfileUser } from "@/features/dashboard/user-profile-modal";
import type { SearchExecutionDetail } from "@/features/projects/search-execution-activity";
import {
  HomeSidebar,
  type PreviousSearchLink,
} from "@/components/shared/home-sidebar";
import type { HomeSearchResultDetailView } from "@/lib/home-search-result-detail";
import { cn } from "@/lib/utils";

export function AskLeadivaHome({
  user,
  previousSearches,
  selectedExecutionId = null,
  detail = null,
  selectedLead = null,
}: {
  user: ProfileUser;
  previousSearches: PreviousSearchLink[];
  selectedExecutionId?: string | null;
  detail?: SearchExecutionDetail | null;
  selectedLead?: HomeSearchResultDetailView | null;
}) {
  const showingLead = Boolean(selectedExecutionId && selectedLead);
  const showingResults = Boolean(selectedExecutionId && detail && !selectedLead);

  return (
    <div className="flex min-h-screen flex-col bg-surface-base md:flex-row">
      <HomeSidebar
        user={user}
        previousSearches={previousSearches}
        selectedExecutionId={selectedExecutionId}
      />
      <main
        className={cn(
          "relative flex min-h-[calc(100vh-57px)] min-w-0 flex-1 flex-col md:min-h-screen",
          showingResults || showingLead || selectedExecutionId
            ? "items-stretch"
            : "items-center justify-center px-6 py-10",
        )}
      >
        {showingLead && selectedLead && selectedExecutionId ? (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-8 pb-4">
              <HomeSearchResultDetail
                executionId={selectedExecutionId}
                detail={selectedLead}
              />
            </div>
            <div className="sticky bottom-0 shrink-0 bg-surface-base px-6 pt-2 pb-5">
              <div className="mx-auto w-full max-w-5xl">
                <AskLeadivaPrompt
                  variant="docked"
                  userName={user.firstName}
                />
              </div>
            </div>
          </>
        ) : showingResults && detail ? (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-8 pb-4">
              <HomeSearchResults detail={detail} />
            </div>
            <div className="sticky bottom-0 shrink-0 bg-surface-base px-6 pt-2 pb-5">
              <div className="mx-auto w-full max-w-5xl">
                <AskLeadivaPrompt
                  variant="docked"
                  userName={user.firstName}
                />
              </div>
            </div>
          </>
        ) : selectedExecutionId && !detail ? (
          <>
            <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-10">
              <p className="max-w-md text-center text-sm text-text-secondary">
                No se encontró esa búsqueda. Selecciona otra del historial o
                inicia una nueva.
              </p>
            </div>
            <div className="sticky bottom-0 shrink-0 bg-surface-base px-6 pt-2 pb-5">
              <div className="mx-auto w-full max-w-5xl">
                <AskLeadivaPrompt
                  variant="docked"
                  userName={user.firstName}
                />
              </div>
            </div>
          </>
        ) : (
          <AskLeadivaPrompt userName={user.firstName} />
        )}
      </main>
    </div>
  );
}
