/** Shared SiteBolt light theme utility classes */
export const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";

export const cardClass =
  "rounded-xl border border-slate-200 bg-white shadow-sm";

export const sectionClass =
  "space-y-3 rounded-xl border border-slate-200 bg-white p-4";

/** Outer app shell — transparent so the global plumbing watermark shows through. */
export const appShellClass = "bg-transparent";

export const modalOverlayClass =
  "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4";

export const modalClass =
  "relative max-h-[92vh] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl";

export const labelClass = "text-xs text-slate-500";

/** Portaled dropdown / combobox panel — escapes overflow-hidden parents. */
export const dropdownPanelClass =
  "overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg";
