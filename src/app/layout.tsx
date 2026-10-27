import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteBoltAIProvider } from "@/components/ai/SiteBoltAIContext";
import SiteBoltAIModal from "@/components/ai/SiteBoltAIModal";
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
  applicationName: "Site-Bolt",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Site-Bolt",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-title": "Site-Bolt",
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
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Site-Bolt" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <script dangerouslySetInnerHTML={{ __html: UI_THEME_BOOTSTRAP_SCRIPT }} />
        <ThemeProvider>
          <SiteBoltAIProvider>
            <NativeAppBootstrap />
            <AppShell>{children}</AppShell>
            <SiteBoltChatWidget />
            <SiteBoltAIModal />
          </SiteBoltAIProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
