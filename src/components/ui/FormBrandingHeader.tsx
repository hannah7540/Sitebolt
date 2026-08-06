"use client";

import CompanyLogo from "@/components/ui/CompanyLogo";
import { cn } from "@/lib/utils";

interface FormBrandingHeaderProps {
  title: string;
  subtitle?: string;
  meta?: string;
  metaClassName?: string;
  className?: string;
  printFriendly?: boolean;
}

export default function FormBrandingHeader({
  title,
  subtitle,
  meta,
  metaClassName,
  className,
  printFriendly = true,
}: FormBrandingHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 border-b border-slate-200 pb-4",
        printFriendly && "print:border-slate-400 print:pb-3",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <h2
          className={cn(
            "text-lg font-bold text-slate-900",
            printFriendly && "print:text-black"
          )}
        >
          {title}
        </h2>
        {subtitle ? (
          <p
            className={cn(
              "mt-0.5 text-sm text-slate-500",
              printFriendly && "print:text-slate-700"
            )}
          >
            {subtitle}
          </p>
        ) : null}
        {meta ? (
          <p
            className={cn(
              "mt-1 text-xs font-medium text-orange-600",
              printFriendly && "print:text-slate-800",
              metaClassName
            )}
          >
            {meta}
          </p>
        ) : null}
      </div>
      <div
        className={cn(
          "shrink-0 rounded-lg border border-slate-100 bg-white px-2 py-1.5",
          printFriendly && "print:border-slate-300 print:bg-white"
        )}
      >
        <CompanyLogo size="form" showFallback />
      </div>
    </div>
  );
}
