import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white/80 px-4 py-6 text-center text-sm text-slate-500">
      <p className="mb-2">
        &copy; {new Date().getFullYear()} SiteBolt. Construction safety &amp; compliance
        management.
      </p>
      <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <Link href="/privacy" className="font-medium text-orange-600 hover:text-orange-700">
          Privacy Policy
        </Link>
        <a
          href="mailto:support@site-bolt.com.au"
          className="font-medium text-slate-600 hover:text-slate-800"
        >
          support@site-bolt.com.au
        </a>
      </nav>
    </footer>
  );
}
