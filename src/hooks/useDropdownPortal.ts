import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

export interface DropdownPortalPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: "bottom" | "top";
}

const DEFAULT_GAP = 4;
const DEFAULT_MAX_HEIGHT = 280;
const VIEWPORT_PADDING = 8;

export interface UseDropdownPortalOptions {
  gap?: number;
  maxHeight?: number;
  minWidth?: number;
  /** When true (default), panel width matches the trigger width. */
  matchTriggerWidth?: boolean;
}

export function useDropdownPortal(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  options: UseDropdownPortalOptions = {}
) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<DropdownPortalPosition | null>(null);

  const {
    gap = DEFAULT_GAP,
    maxHeight = DEFAULT_MAX_HEIGHT,
    minWidth,
    matchTriggerWidth = true,
  } = options;

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const resolvedMinWidth = minWidth ?? (matchTriggerWidth ? rect.width : 0);
    const width = Math.max(resolvedMinWidth, matchTriggerWidth ? rect.width : 0);

    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PADDING;
    const spaceAbove = rect.top - VIEWPORT_PADDING;

    let placement: "bottom" | "top" = "bottom";
    let availableHeight = spaceBelow;

    if (spaceBelow < maxHeight && spaceAbove > spaceBelow) {
      placement = "top";
      availableHeight = spaceAbove;
    }

    const constrainedMaxHeight = Math.max(
      120,
      Math.min(maxHeight, availableHeight - gap)
    );

    const left = Math.min(
      Math.max(VIEWPORT_PADDING, rect.left),
      window.innerWidth - width - VIEWPORT_PADDING
    );

    const top =
      placement === "bottom"
        ? rect.bottom + gap
        : Math.max(VIEWPORT_PADDING, rect.top - gap - constrainedMaxHeight);

    setPosition({
      top,
      left,
      width,
      maxHeight: constrainedMaxHeight,
      placement,
    });
  }, [gap, matchTriggerWidth, maxHeight, minWidth, triggerRef]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    const handleUpdate = () => updatePosition();
    window.addEventListener("resize", handleUpdate);
    window.addEventListener("scroll", handleUpdate, true);

    return () => {
      window.removeEventListener("resize", handleUpdate);
      window.removeEventListener("scroll", handleUpdate, true);
    };
  }, [open, updatePosition]);

  const panelStyle: CSSProperties | undefined = position
    ? {
        position: "fixed",
        top: position.top,
        left: position.left,
        width: position.width,
        maxHeight: position.maxHeight,
        zIndex: 100,
      }
    : undefined;

  return { panelRef, panelStyle, position, updatePosition };
}

/** Close dropdown when clicking outside trigger and panel (panel is usually portaled). */
export function useDropdownDismiss(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  onClose: (() => void) | undefined
) {
  useEffect(() => {
    if (!open || !onClose) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose, panelRef, triggerRef]);
}
