"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useCompanyBranding } from "@/components/branding/CompanyBrandingProvider";
import { cn } from "@/lib/utils";

const ENTITY_TYPE_LABELS: Record<string, string> = {
  project: "Project",
  plant: "Plant",
  worker: "Worker",
  fleet: "Fleet",
  asset: "Asset",
};

export function formEntityTypeLabel(entityType: string | null | undefined): string {
  if (!entityType) return "";
  return ENTITY_TYPE_LABELS[entityType] ?? entityType;
}

function BrandLogo() {
  const { logoUrl, companyName } = useCompanyBranding();
  const [failed, setFailed] = useState<"brand" | "fallback" | null>(null);
  const src = failed === "brand" || !logoUrl ? "/logo.png" : logoUrl;

  if (failed === "fallback" && !logoUrl) {
    return (
      <span className="text-sm font-bold uppercase tracking-wide text-orange-500">
        {companyName || "SiteBolt"}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`${companyName || "Company"} logo`}
      className="h-12 w-auto max-w-[160px] object-contain object-left"
      onError={() => setFailed(logoUrl && failed !== "brand" ? "brand" : "fallback")}
    />
  );
}

interface FormBrandHeaderProps {
  title: string;
  titleId?: string;
  description?: string | null;
  dateLabel?: string | null;
  submitterName?: string | null;
  pills?: string[];
  onClose?: () => void;
}

export default function FormBrandHeader({
  title,
  titleId,
  description,
  dateLabel,
  submitterName,
  pills = [],
  onClose,
}: FormBrandHeaderProps) {
  const visiblePills = pills.map((pill) => pill.trim()).filter(Boolean);

  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="flex items-start justify-between gap-3 px-6 py-4">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <div className="shrink-0 pt-0.5">
            <BrandLogo />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="text-xl font-bold tracking-tight text-slate-900"
            >
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm text-slate-500">{description}</p>
            ) : null}
            {visiblePills.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {visiblePills.map((pill) => (
                  <span
                    key={pill}
                    className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-orange-800"
                  >
                    {pill}
                  </span>
                ))}
              </div>
            ) : null}
            {dateLabel || submitterName ? (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-slate-600">
                {dateLabel ? <span>Date: {dateLabel}</span> : null}
                {submitterName ? <span>Submitter: {submitterName}</span> : null}
              </div>
            ) : null}
          </div>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        ) : null}
      </div>
      <div className={cn("h-1 w-full bg-orange-500")} />
    </div>
  );
}
