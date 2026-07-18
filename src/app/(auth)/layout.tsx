export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-base px-4 py-12 sm:px-6">
      <div className="w-full max-w-[380px]">{children}</div>
    </main>
  );
}
