import { DashboardShell } from "@/components/shared/dashboard-shell";
import { requireSession } from "@/server/auth/session";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();

  return (
    <DashboardShell userName={session.user.name}>
      {children}
    </DashboardShell>
  );
}
