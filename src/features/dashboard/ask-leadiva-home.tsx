"use client";

import { useState } from "react";

import { AskLeadivaPrompt } from "@/features/dashboard/ask-leadiva-prompt";
import { HomeSearchResultDetail } from "@/features/dashboard/home-search-result-detail";
import { HomeSearchResults } from "@/features/dashboard/home-search-results";
import { HomeSearchSourceSelect } from "@/features/dashboard/home-search-source-select";
import type { ProfileUser } from "@/features/dashboard/user-profile-modal";
import type { SearchExecutionDetail } from "@/features/projects/search-execution-activity";
import {
  HomeSidebar,
  type PreviousSearchLink,
} from "@/components/shared/home-sidebar";
import type { HomeSearchResultDetailView } from "@/lib/home-search-result-detail";
import {
  defaultHomeSearchSource,
  type HomeSearchSourceId,
} from "@/lib/home-search-source";
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
  const [source, setSource] = useState<HomeSearchSourceId>(
    defaultHomeSearchSource,
  );
  const isHomeView = !selectedExecutionId;
  const showingLead = Boolean(selectedExecutionId && selectedLead);
  const showingResults = Boolean(selectedExecutionId && detail && !selectedLead);
  // Category picker is home-only (`/`). Never show it on `/b/[id]` views.
  const hideComprasalSearchControls = source === "COMPRASAL";

  function renderDockedPrompt() {
    if (hideComprasalSearchControls) {
      return null;
    }

    return (
      <div className="sticky bottom-0 shrink-0 bg-surface-base px-6 pt-2 pb-5">
        <div className="mx-auto w-full max-w-5xl">
          <AskLeadivaPrompt
            variant="docked"
            userName={user.firstName}
            source={source}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface-base md:flex-row">
      <HomeSidebar
        user={user}
        previousSearches={previousSearches}
        selectedExecutionId={selectedExecutionId}
        sourceSelect={
          isHomeView ? (
            <HomeSearchSourceSelect
              value={source}
              onValueChange={setSource}
              size="sm"
            />
          ) : undefined
        }
      />
      <main
        className={cn(
          "relative flex min-h-[calc(100vh-57px)] min-w-0 flex-1 flex-col md:min-h-screen",
          showingLead && "h-[calc(100vh-57px)] overflow-hidden md:h-screen",
          showingResults || showingLead || selectedExecutionId
            ? "items-stretch"
            : "items-center justify-center px-6 py-10",
        )}
      >
        {isHomeView ? (
          <div className="absolute top-0 left-0 z-10 hidden items-center px-4 pt-6 md:flex">
            <HomeSearchSourceSelect
              value={source}
              onValueChange={setSource}
            />
          </div>
        ) : null}

        {showingLead && selectedLead && selectedExecutionId ? (
          <>
            <div
              className={cn(
                "flex min-h-0 flex-1 flex-col overflow-hidden px-6 pt-4 md:pt-5",
                hideComprasalSearchControls ? "pb-2" : "pb-0",
              )}
            >
              <HomeSearchResultDetail detail={selectedLead} />
            </div>
            {renderDockedPrompt()}
          </>
        ) : showingResults && detail ? (
          <>
            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto px-6 pt-8 md:pt-20",
                hideComprasalSearchControls ? "pb-8" : "pb-4",
              )}
            >
              <HomeSearchResults detail={detail} />
            </div>
            {renderDockedPrompt()}
          </>
        ) : selectedExecutionId && !detail ? (
          <>
            <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-10 md:pt-20">
              <p className="max-w-md text-center text-sm text-text-secondary">
                No se encontró esa búsqueda. Selecciona otra del historial o
                inicia una nueva.
              </p>
            </div>
            {renderDockedPrompt()}
          </>
        ) : (
          <AskLeadivaPrompt userName={user.firstName} source={source} />
        )}
      </main>
    </div>
  );
}
