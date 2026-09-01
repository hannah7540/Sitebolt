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
