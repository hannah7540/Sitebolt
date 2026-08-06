import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import BrandingRoot from "@/components/branding/BrandingRoot";
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <BrandingRoot>{children}</BrandingRoot>
      </body>
    </html>
  );
}
