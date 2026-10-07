import Link from "next/link";
import { cn } from "@/lib/utils";

export default function SiteFooter({
  variant = "light",
}: {
  variant?: "light" | "dark";
}) {
  const dark = variant === "dark";
  return (
    <footer
      className={cn(
        "px-4 py-6 text-center text-sm",
        dark
          ? "border-t border-white/10 bg-[#13171B] text-zinc-400"
          : "border-t border-slate-200 bg-white/80 text-slate-500"
      )}
    >
      <p className="mb-2">
        &copy; {new Date().getFullYear()} SiteBolt. Construction safety &amp; compliance
        management.
      </p>
      <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <Link
          href="/privacy"
          className={cn(
            "font-medium",
            dark ? "text-[#FF8533] hover:text-[#FF6B00]" : "text-orange-600 hover:text-orange-700"
          )}
        >
          Privacy Policy
        </Link>
        <a
          href="mailto:support@site-bolt.com.au"
          className={cn(
            "font-medium",
            dark ? "text-zinc-400 hover:text-white" : "text-slate-600 hover:text-slate-800"
          )}
        >
          support@site-bolt.com.au
        </a>
      </nav>
    </footer>
  );
}
