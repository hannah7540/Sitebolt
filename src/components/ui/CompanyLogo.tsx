"use client";

import { useEffect, useState } from "react";
import { useCompanyBranding } from "@/components/branding/CompanyBrandingProvider";
import { cn } from "@/lib/utils";

type CompanyLogoSize = "sm" | "md" | "lg" | "form";

const sizeClasses: Record<CompanyLogoSize, string> = {
  sm: "h-8 max-w-[96px]",
  md: "h-10 max-w-[120px]",
  lg: "h-12 max-w-[160px]",
  form: "h-14 max-w-[180px]",
};

const textSizeClasses: Record<CompanyLogoSize, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
  form: "text-base",
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
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [logoUrl]);

  if (logoUrl && !broken) {
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
        onError={() => {
          console.error("Failed to load company logo:", logoUrl);
          setBroken(true);
        }}
      />
    );
  }

  if (!showFallback) {
    return loading ? null : (
      <span className={cn("font-semibold text-slate-900", textSizeClasses[size], className)}>
        {companyName}
      </span>
    );
  }

  return (
    <span
      className={cn("font-semibold text-slate-900", textSizeClasses[size], className)}
      aria-label={`${companyName} branding`}
    >
      {companyName}
    </span>
  );
}
