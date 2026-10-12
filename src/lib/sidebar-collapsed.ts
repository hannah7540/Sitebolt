export const SIDEBAR_COLLAPSED_STORAGE_KEY = "sitebolt_sidebar_collapsed";
export const SIDEBAR_COLLAPSED_COOKIE = "sitebolt_sidebar_collapsed";
export const SIDEBAR_COLLAPSED_EVENT = "sitebolt-sidebar-collapsed";

export function readSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
    if (stored === "1" || stored === "true") return true;
    if (stored === "0" || stored === "false") return false;
    const cookie = document.cookie
      .split("; ")
      .find((part) => part.startsWith(`${SIDEBAR_COLLAPSED_COOKIE}=`));
    return cookie?.split("=")[1] === "1";
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  const value = collapsed ? "1" : "0";
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, value);
  } catch {
    // Ignore quota / private-mode failures.
  }
  document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
  window.dispatchEvent(new Event(SIDEBAR_COLLAPSED_EVENT));
}
