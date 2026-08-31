"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { modalStickyFooterClass } from "@/lib/ui-classes";

interface ModalActionFooterProps {
  children: ReactNode;
  className?: string;
}

/**
 * Pinned modal footer with mobile/tablet safe-area inset so Cancel / Close /
 * primary actions stay reachable above the device home indicator.
 */
export default function ModalActionFooter({
  children,
  className,
}: ModalActionFooterProps) {
  return (
    <div className={cn(modalStickyFooterClass, className)}>{children}</div>
  );
}
