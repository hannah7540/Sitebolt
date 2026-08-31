/** Shared SiteBolt light theme utility classes */
export const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";

export const cardClass =
  "rounded-xl border border-slate-200 bg-white shadow-sm";

export const sectionClass =
  "space-y-3 rounded-xl border border-slate-200 bg-white p-4";

/** Outer app shell — transparent so the global plumbing watermark shows through. */
export const appShellClass = "bg-transparent";

/**
 * Modal overlay — bottoms sheets on mobile/tablet, centered on desktop.
 * Safe-area padding keeps content clear of notches and home indicators.
 */
export const modalOverlayClass =
  "fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4";

/**
 * Default scrollable modal panel (simple forms). Prefer modalShellClass +
 * modalBodyClass + modalStickyFooterClass when actions must stay reachable.
 */
export const modalClass =
  "relative max-h-[min(92dvh,100%)] w-full overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-6 shadow-xl sm:max-h-[92vh] sm:rounded-2xl";

/** Flex column shell for sticky header/footer modals (no outer padding). */
export const modalShellClass =
  "relative flex max-h-[min(92dvh,100%)] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:max-h-[92vh] sm:rounded-2xl";

/** Scrollable body inside modalShellClass. */
export const modalBodyClass = "min-h-0 flex-1 overflow-y-auto p-6";

/**
 * Sticky action bar for Cancel / Close / Submit — always visible above the
 * home indicator on mobile and tablet.
 */
export const modalStickyFooterClass =
  "shrink-0 border-t border-slate-200 bg-white px-4 pt-3 mobile-safe-area-bottom sm:px-6";

/** Minimum 44×44px touch target for header Close / X controls. */
export const modalCloseIconButtonClass =
  "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600";

export const labelClass = "text-xs text-slate-500";

/** Portaled dropdown / combobox panel — escapes overflow-hidden parents. */
export const dropdownPanelClass =
  "overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg";
