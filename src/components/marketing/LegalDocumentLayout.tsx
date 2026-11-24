import Link from "next/link";
import SiteBoltMark from "@/components/marketing/SiteBoltMark";
import SiteFooter from "@/components/layout/SiteFooter";
import {
  marketingBodyClass,
  marketingBrandMarkClass,
  marketingBrandSubClass,
  marketingGhostButtonClass,
  marketingGlassCardClass,
  marketingHeaderClass,
  marketingHeadingClass,
  marketingMutedClass,
  marketingPageClass,
} from "@/components/marketing/marketing-theme";

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight text-[#F8FAFC]">{title}</h2>
      <div className={`space-y-3 text-sm ${marketingBodyClass}`}>{children}</div>
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
    <div className={`flex flex-col ${marketingPageClass}`}>
      <header className={marketingHeaderClass}>
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <SiteBoltMark className="h-9 w-9" />
            <div>
              <p className={marketingBrandMarkClass.replace("text-[15px]", "text-[14px]")}>
                SITEBOLT
              </p>
              <p className={marketingBrandSubClass}>{eyebrow}</p>
            </div>
          </Link>
          <Link href="/" className={`${marketingGhostButtonClass} !px-3 !py-1.5`}>
            Back to Home
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#F97316]">
            Site-Bolt Software Solutions
          </p>
          <h1 className={`mt-3 text-3xl tracking-tight sm:text-4xl ${marketingHeadingClass}`}>
            {title}
          </h1>
          <p className={`mt-4 max-w-3xl text-sm ${marketingBodyClass}`}>{intro}</p>
          <p className={`mt-3 text-xs ${marketingMutedClass}`}>Last updated: {lastUpdated}</p>
        </div>

        <div className={`${marketingGlassCardClass} space-y-8 p-5 sm:p-8`}>{children}</div>
      </main>

      <SiteFooter variant="dark" />
    </div>
  );
}
