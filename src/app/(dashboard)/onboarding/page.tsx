import { OnboardingForm } from "@/features/auth/components/onboarding-form";
import { requireSession } from "@/server/auth/session";

export default async function OnboardingPage() {
  const session = await requireSession();

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <OnboardingForm initialCategories={session.user.interestCategories} />
    </div>
  );
}
