import Link from "next/link";
import SiteBoltMark from "@/components/marketing/SiteBoltMark";
import SiteFooter from "@/components/layout/SiteFooter";

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-slate-600">{children}</div>
    </section>
  );
}

export default function LegalDocumentLayout({
  eyebrow,
  title,
  intro,
  lastUpdated,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  lastUpdated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <SiteBoltMark className="h-9 w-9" />
            <div>
              <p className="text-[14px] font-extrabold tracking-[0.18em] text-slate-900">SITEBOLT</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#FF6B00]">
                {eyebrow}
              </p>
            </div>
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-[#FF6B00] hover:text-[#FF6B00]"
          >
            Back to Home
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#FF6B00]">
            Site-Bolt Software Solutions
          </p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            {title}
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-500">{intro}</p>
          <p className="mt-3 text-xs text-slate-500">Last updated: {lastUpdated}</p>
        </div>

        <div className="space-y-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          {children}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
