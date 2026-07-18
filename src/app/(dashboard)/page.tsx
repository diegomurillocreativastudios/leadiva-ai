import { AskLeadivaHome } from "@/features/dashboard/ask-leadiva-home";
import { loadAskLeadivaHome } from "@/features/dashboard/load-ask-leadiva-home";
import { requireSession } from "@/server/auth/session";

export default async function RootHomePage() {
  const session = await requireSession();
  const home = await loadAskLeadivaHome({
    userId: session.user.id,
    sessionName: session.user.name,
    sessionEmail: session.user.email,
    sessionRole: session.user.role,
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
