export const PUBLIC_AUTH_FLOW_PATHS = [
  "/reset-password",
  "/set-password",
  "/auth/callback",
  "/auth/confirm",
  "/onboarding",
] as const;

export function isPublicAuthFlowPath(pathname: string): boolean {
  const path = pathname.split("?")[0] || pathname;
  return PUBLIC_AUTH_FLOW_PATHS.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}

/** Global auth listeners must never bounce these pages to /login or /admin. */
export function isExemptFromAuthRedirect(pathname?: string | null): boolean {
  const path =
    (pathname ??
      (typeof window !== "undefined" ? window.location.pathname : "")) ||
    "";
  return (
    path.startsWith("/reset-password") ||
    path.startsWith("/set-password") ||
    path.startsWith("/onboarding") ||
    path.startsWith("/auth/callback") ||
    path.startsWith("/auth/confirm")
  );
}

export function hasAuthCodeQuery(
  search: string = typeof window !== "undefined" ? window.location.search : ""
): boolean {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  );
  return Boolean(params.get("code") || params.get("token_hash"));
}

export function hasAuthHashFragment(
  hash: string = typeof window !== "undefined" ? window.location.hash : ""
): boolean {
  const value = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!value) return false;
  const params = new URLSearchParams(value);
  const type = (params.get("type") ?? "").toLowerCase();
  return Boolean(
    params.get("access_token") ||
      params.get("refresh_token") ||
      type === "recovery" ||
      type === "invite" ||
      type === "magiclink" ||
      type === "signup"
  );
}

export function resetPasswordLocationWithHash(): string {
  if (typeof window === "undefined") return "/reset-password";
  return `/reset-password${window.location.search}${window.location.hash}`;
}
