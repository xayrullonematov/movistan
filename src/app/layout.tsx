import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { UserProvider } from "@/lib/auth/user-context";
import AppHeader from "@/components/shell/AppHeader";
import Toaster from "@/components/ui/Toaster";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import { KeyboardShortcutsHelpProvider } from "@/components/shell/KeyboardShortcutsHelp";
import { resolveServerTheme, THEME_COOKIE } from "@/lib/theme";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RepoScope",
  description: "AI repo reviews with evidence. Paste a GitHub repo, ask what to check, get a file-level report you can fix.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get(THEME_COOKIE)?.value;
  const theme = resolveServerTheme(themeCookie);

  return (
    <html lang="en" data-theme={theme} className={`${inter.variable} ${theme}`}>
      <body className="min-h-screen bg-[var(--background)] text-[var(--foreground)] antialiased">
        <UserProvider>
          <AppHeader />
          <ErrorBoundary>{children}</ErrorBoundary>
          <KeyboardShortcutsHelpProvider />
          <Toaster />
        </UserProvider>
      </body>
    </html>
  );
}
