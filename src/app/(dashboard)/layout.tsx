import { requireSession } from "@/server/auth/session";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession();
  return children;
}
