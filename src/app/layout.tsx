import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import SiteBoltChatWidget from "@/components/ai/SiteBoltChatWidget";
import AppShell from "@/components/layout/AppShell";
import NativeAppBootstrap from "@/components/layout/NativeAppBootstrap";
import ThemeProvider from "@/components/theme/ThemeProvider";
import { UI_THEME_BOOTSTRAP_SCRIPT } from "@/lib/ui-theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SiteBolt — Construction Safety Dashboard",
  description: "Modern construction site safety and compliance management platform",
  applicationName: "SiteBolt",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "SiteBolt",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

/**
 * Root HTML shell only. Auth redirects live in AppShell / proxy — never redirect
 * /setyourpassword, /reset-password, /auth/callback, or /onboarding from this layout.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <script dangerouslySetInnerHTML={{ __html: UI_THEME_BOOTSTRAP_SCRIPT }} />
        <ThemeProvider>
          <NativeAppBootstrap />
          <AppShell>{children}</AppShell>
          <SiteBoltChatWidget />
        </ThemeProvider>
      </body>
    </html>
  );
}
