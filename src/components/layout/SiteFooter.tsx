import Link from "next/link";
import { cn } from "@/lib/utils";

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
] as const;

export default function SiteFooter({
  variant = "light",
}: {
  variant?: "light" | "dark";
}) {
  const dark = variant === "dark";
  return (
    <footer
      className={cn(
        "px-4 py-8 text-center text-sm",
        dark
          ? "border-t border-white/10 bg-[#1F2429] text-zinc-400"
          : "border-t border-slate-200 bg-white/80 text-slate-500"
      )}
    >
      <p className={cn("mb-3 leading-relaxed", dark ? "text-zinc-400" : "text-slate-500")}>
        &copy; 2026 Site-Bolt Software Solutions. All rights reserved. | ABN: 21 852 687 427
      </p>
      <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        {LEGAL_LINKS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "font-medium transition-colors duration-200",
              dark
                ? "text-zinc-300 hover:text-[#FF6B00]"
                : "text-slate-600 hover:text-[#FF6B00]"
            )}
          >
            {item.label}
          </Link>
        ))}
        <a
          href="mailto:hannah@site-bolt.com.au"
          className={cn(
            "font-medium transition-colors duration-200",
            dark
              ? "text-zinc-300 hover:text-[#FF6B00]"
              : "text-slate-600 hover:text-[#FF6B00]"
          )}
        >
          Contact Support
        </a>
      </nav>
    </footer>
  );
}
