import type { Metadata } from "next";
import Link from "next/link";
import { Download, HardHat } from "lucide-react";
import SiteFooter from "@/components/layout/SiteFooter";
import { generateQrSvg } from "@/lib/qr-code";
import { cardClass } from "@/lib/ui-classes";

const DOWNLOAD_PAGE_URL = "https://www.site-bolt.com.au/download";
const APK_HREF = "/sitebolt.apk";

export const metadata: Metadata = {
  title: "Download SiteBolt for Android",
  description: "Download the SiteBolt Android app and install it on your device.",
};

const INSTALL_STEPS = [
  'Tap "Download Android App" and accept the download prompt.',
  "Open the downloaded sitebolt.apk file from your notification tray or Downloads folder.",
  'If prompted by your browser or Android, tap "Settings" and toggle "Allow from this source" to install.',
] as const;

export default function DownloadPage() {
  const qrSvg = generateQrSvg(DOWNLOAD_PAGE_URL, 6, 4);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-4 px-4 py-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500">
              <HardHat className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">
                SiteBolt
              </p>
              <p className="text-sm font-medium text-slate-900">Android App</p>
            </div>
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-8">
        <div className={cardClass + " p-6 sm:p-8"}>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Download SiteBolt for Android
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Install the SiteBolt app on your phone so you can sign in, complete
            site work, and stay up to date without using a browser bookmark.
          </p>

          <a
            href={APK_HREF}
            download="sitebolt.apk"
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-4 text-base font-semibold text-white shadow-sm hover:bg-orange-600"
          >
            <Download className="h-5 w-5" />
            Download Android App
          </a>

          <ol className="mt-8 space-y-4">
            {INSTALL_STEPS.map((step, index) => (
              <li key={step} className="flex gap-3 text-sm leading-relaxed text-slate-700">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">
                  {index + 1}
                </span>
                <span className="pt-1">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className={cardClass + " mt-6 p-6 text-center"}>
          <p className="text-sm font-semibold text-slate-900">Scan to open this page</p>
          <p className="mt-1 text-xs text-slate-500">
            Show or print this QR code so workers can open the download page on
            their phone.
          </p>
          <div
            className="mx-auto mt-4 w-52 max-w-full [&_svg]:h-auto [&_svg]:w-full"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p className="mt-3 break-all text-xs text-slate-500">{DOWNLOAD_PAGE_URL}</p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
