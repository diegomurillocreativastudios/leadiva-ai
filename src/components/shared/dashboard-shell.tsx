"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { AppSidebar } from "@/components/shared/app-sidebar";

export function DashboardShell({
  userName,
  children,
}: {
  userName: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isOnboarding = pathname.startsWith("/onboarding");

  if (isOnboarding) {
    return (
      <main className="min-h-screen bg-surface-base">
        {children}
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface-base md:flex-row">
      <AppSidebar userName={userName} />
      <main className="min-w-0 flex-1 overflow-auto px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
