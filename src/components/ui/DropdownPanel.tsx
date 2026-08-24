"use client";

import { createPortal } from "react-dom";
import { useEffect, useState, type ReactNode, type RefObject } from "react";
import {
  useDropdownDismiss,
  useDropdownPortal,
  type UseDropdownPortalOptions,
} from "@/hooks/useDropdownPortal";
import { dropdownPanelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface DropdownPanelProps extends UseDropdownPortalOptions {
  open: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  className?: string;
  onClose?: () => void;
}

export default function DropdownPanel({
  open,
  triggerRef,
  children,
  className,
  onClose,
  gap,
  maxHeight,
  minWidth,
  matchTriggerWidth,
}: DropdownPanelProps) {
  const [mounted, setMounted] = useState(false);
  const { panelRef, panelStyle } = useDropdownPortal(open, triggerRef, {
    gap,
    maxHeight,
    minWidth,
    matchTriggerWidth,
  });

  useDropdownDismiss(open, triggerRef, panelRef, onClose);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted || !panelStyle) return null;

  return createPortal(
    <div
      ref={panelRef}
      style={panelStyle}
      className={cn(dropdownPanelClass, className)}
    >
      {children}
    </div>,
    document.body
  );
}
