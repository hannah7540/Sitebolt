"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { usePersistedSidebarCollapsed } from "@/hooks/usePersistedSidebarCollapsed";
import { readSidebarCollapsed } from "@/lib/sidebar-collapsed";
import { cn } from "@/lib/utils";

interface SidebarCollapseContextValue {
  collapsed: boolean;
  iconOnly: boolean;
  setCollapsed: (next: boolean) => void;
  toggleCollapsed: () => void;
  flyoutId: string | null;
  setFlyoutId: (id: string | null) => void;
}

const SidebarCollapseContext = createContext<SidebarCollapseContextValue | null>(null);
const SidebarFlyoutContext = createContext(false);

export function useSidebarCollapse(): SidebarCollapseContextValue {
  const value = useContext(SidebarCollapseContext);
  if (!value) {
    return {
      collapsed: false,
      iconOnly: false,
      setCollapsed: () => undefined,
      toggleCollapsed: () => undefined,
      flyoutId: null,
      setFlyoutId: () => undefined,
    };
  }
  return value;
}

export function useSidebarIconOnly(): boolean {
  const inFlyout = useContext(SidebarFlyoutContext);
  const { iconOnly } = useSidebarCollapse();
  return iconOnly && !inFlyout;
}

export function SidebarCollapseProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = usePersistedSidebarCollapsed();
  const [flyoutId, setFlyoutId] = useState<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    setFlyoutId(null);
  }, [pathname, collapsed]);

  const value = useMemo<SidebarCollapseContextValue>(
    () => ({
      collapsed,
      iconOnly: collapsed,
      setCollapsed,
      toggleCollapsed: () => setCollapsed(!readSidebarCollapsed()),
      flyoutId,
      setFlyoutId,
    }),
    [collapsed, flyoutId, setCollapsed]
  );

  return (
    <SidebarCollapseContext.Provider value={value}>
      {children}
    </SidebarCollapseContext.Provider>
  );
}

export function SidebarCollapseToggle({ className }: { className?: string }) {
  const { collapsed, toggleCollapsed } = useSidebarCollapse();
  return (
    <button
      type="button"
      onClick={toggleCollapsed}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-pressed={collapsed}
      className={cn(
        "hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-orange-50 hover:text-orange-600 lg:inline-flex",
        className
      )}
    >
      {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
    </button>
  );
}

function SidebarFlyout({
  open,
  title,
  triggerRef,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  triggerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setRect(null);
      return;
    }
    setRect(triggerRef.current.getBoundingClientRect());
  }, [open, triggerRef]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !rect || typeof document === "undefined") return null;

  const top = Math.min(rect.top, Math.max(16, window.innerHeight - 32));
  const maxHeight = Math.max(160, window.innerHeight - top - 16);

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-[60] cursor-default bg-transparent"
        aria-label="Close sidebar menu"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="fixed z-[70] w-64 overflow-y-auto rounded-lg border border-border bg-surface p-2 text-foreground shadow-xl"
        style={{ left: rect.right + 8, top, maxHeight }}
        role="menu"
      >
        <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-orange-600">
          {title}
        </p>
        <SidebarFlyoutContext.Provider value>{children}</SidebarFlyoutContext.Provider>
      </div>
    </>,
    document.body
  );
}

export function SidebarSectionShell({
  id,
  icon: Icon,
  label,
  active = false,
  header,
  children,
}: {
  id: string;
  icon: LucideIcon;
  label: string;
  active?: boolean;
  header: ReactNode;
  children: ReactNode;
}) {
  const { iconOnly, flyoutId, setFlyoutId } = useSidebarCollapse();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const open = flyoutId === id;

  if (!iconOnly) {
    return <div className="border-b border-slate-200 pb-3">{header}{children}</div>;
  }

  return (
    <div className="border-b border-slate-200 py-1">
      <button
        ref={triggerRef}
        type="button"
        title={label}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setFlyoutId(open ? null : id)}
        className={cn(
          "flex w-full items-center justify-center py-2.5 text-orange-600 transition hover:bg-orange-50",
          active && "bg-orange-50 text-orange-700",
          open && "bg-orange-50"
        )}
      >
        <Icon className="h-5 w-5" />
      </button>
      <SidebarFlyout
        open={open}
        title={label}
        triggerRef={triggerRef}
        onClose={() => setFlyoutId(null)}
      >
        {children}
      </SidebarFlyout>
    </div>
  );
}
