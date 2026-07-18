import { HomeDashboard } from "@/features/dashboard/home-dashboard";
import { requireSession } from "@/server/auth/session";
import { getDashboardSummary } from "@/server/services/opportunity.service";

export default async function HomePage() {
  const session = await requireSession();

  const summary = await getDashboardSummary();
  const userFirstName = session.user.name.split(" ")[0] ?? "";

  return <HomeDashboard userFirstName={userFirstName} summary={summary} />;
}
