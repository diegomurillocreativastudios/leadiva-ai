import type { Metadata } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";

import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const generalSans = localFont({
  src: [
    {
      path: "../fonts/GeneralSans-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../fonts/GeneralSans-Semibold.woff2",
      weight: "600",
      style: "normal",
    },
  ],
  // Distinct from Tailwind `--font-heading` theme token to avoid a circular CSS var.
  variable: "--font-general-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Leadiva",
  description: "Inteligencia de oportunidades comerciales",
  icons: {
    icon: "/leadiva.svg",
    apple: "/leadiva.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${generalSans.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
