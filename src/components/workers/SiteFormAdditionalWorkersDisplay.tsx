"use client";

import type { SiteFormAdditionalWorker } from "@/lib/site-forms";
import { labelClass, sectionClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface SiteFormAdditionalWorkersDisplayProps {
  workers: SiteFormAdditionalWorker[];
  className?: string;
  printFriendly?: boolean;
}

export default function SiteFormAdditionalWorkersDisplay({
  workers,
  className,
  printFriendly = true,
}: SiteFormAdditionalWorkersDisplayProps) {
  if (workers.length === 0) return null;

  return (
    <div
      className={cn(sectionClass, className, printFriendly && "print:break-inside-avoid")}
    >
      <p
        className={cn(
          "mb-2 text-sm font-semibold text-slate-900",
          printFriendly && "print:text-black"
        )}
      >
        Additional Workers / Late Sign-ons ({workers.length})
      </p>
      <ul className="space-y-3">
        {workers.map((worker, index) => (
          <li
            key={`${worker.name}-${index}`}
            className={cn(
              "rounded-lg border border-slate-200 bg-white p-3",
              printFriendly && "print:border-slate-400 print:bg-white"
            )}
          >
            <p className={cn("font-medium text-slate-900", printFriendly && "print:text-black")}>
              {worker.name}
            </p>
            {worker.signature ? (
              <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={worker.signature}
                  alt={`${worker.name} signature`}
                  className="max-h-24 w-full object-contain"
                />
              </div>
            ) : (
              <p className={cn("mt-1 text-xs text-slate-500", labelClass)}>
                No signature stored.
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
