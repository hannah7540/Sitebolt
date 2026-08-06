"use client";

import { Building2 } from "lucide-react";
import { useCompanyBranding } from "@/components/branding/CompanyBrandingProvider";
import { cn } from "@/lib/utils";

type CompanyLogoSize = "sm" | "md" | "lg" | "form";

const sizeClasses: Record<CompanyLogoSize, string> = {
  sm: "h-8 max-w-[96px]",
  md: "h-10 max-w-[120px]",
  lg: "h-12 max-w-[160px]",
  form: "h-14 max-w-[180px]",
};

interface CompanyLogoProps {
  size?: CompanyLogoSize;
  className?: string;
  imageClassName?: string;
  showFallback?: boolean;
}

export default function CompanyLogo({
  size = "md",
  className,
  imageClassName,
  showFallback = true,
}: CompanyLogoProps) {
  const { logoUrl, companyName, loading } = useCompanyBranding();

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${companyName} logo`}
        className={cn(
          "w-auto object-contain object-left",
          sizeClasses[size],
          imageClassName,
          className
        )}
      />
    );
  }

  if (!showFallback || loading) {
    return null;
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 text-slate-700",
        className
      )}
      aria-label={`${companyName} branding`}
    >
      <Building2 className={cn(size === "sm" ? "h-5 w-5" : "h-6 w-6", "text-orange-500")} />
      <span
        className={cn(
          "font-semibold text-slate-900",
          size === "sm" ? "text-xs" : "text-sm"
        )}
      >
        {companyName}
      </span>
    </div>
  );
}
