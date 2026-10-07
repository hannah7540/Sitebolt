import type { NextRequest } from "next/server";

export const PRODUCTION_APP_ORIGIN = "https://app.site-bolt.com.au";
export const PRODUCTION_MARKETING_ORIGIN = "https://www.site-bolt.com.au";
export const PRODUCTION_APP_LOGIN_URL = `${PRODUCTION_APP_ORIGIN}/login`;

const MARKETING_PUBLIC_PATHS = [
  "/",
  "/marketing",
  "/enquire",
  "/privacy",
  "/download",
  "/support",
] as const;

const OPERATIONAL_APP_PREFIXES = [
  "/login",
  "/projects",
  "/accounts",
  "/organisation",
  "/admin",
  "/administration",
  "/worker-dashboard",
  "/worker/",
  "/emails",
  "/sms",
  "/settings",
  "/account",
  "/itc",
  "/plant/",
  "/prestart/",
  "/pre-start/",
  "/scan/",
] as const;

export function hostnameFromHost(host: string | null | undefined): string {
  return String(host ?? "")
    .split(",")[0]
    .split(":")[0]
    .trim()
    .toLowerCase();
}

export function requestHostHeader(request: Pick<NextRequest, "headers">): string {
  return (
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    ""
  );
}

export function isAppHostname(host: string | null | undefined): boolean {
  const hostname = hostnameFromHost(host);
  return hostname.startsWith("app.") || hostname.startsWith("app.localhost");
}

/** Any host that is not the operational app subdomain is a public marketing host. */
export function isMarketingHostname(host: string | null | undefined): boolean {
  return !isAppHostname(host);
}

export function isMarketingPublicPath(pathname: string): boolean {
  return MARKETING_PUBLIC_PATHS.some(
    (path) => pathname === path || (path !== "/" && pathname.startsWith(`${path}/`))
  );
}

export function isOperationalAppPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  return OPERATIONAL_APP_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(prefix)
  );
}

export function resolveAppOriginFromRequest(request: NextRequest): string {
  const host = requestHostHeader(request);
  const hostname = hostnameFromHost(host);
  const port = host?.includes(":") ? host.split(":")[1] : "";
  const protocol = request.nextUrl.protocol.replace(":", "") || "https";

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "www.localhost"
  ) {
    return `${protocol}://app.localhost${port ? `:${port}` : ""}`;
  }

  const configured = process.env.NEXT_PUBLIC_APP_ORIGIN?.trim().replace(/\/$/, "");
  return configured || PRODUCTION_APP_ORIGIN;
}

export function getAppLoginUrl(): string {
  if (typeof window !== "undefined") {
    const hostname = hostnameFromHost(window.location.host);
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "www.localhost"
    ) {
      const port = window.location.port ? `:${window.location.port}` : "";
      return `${window.location.protocol}//app.localhost${port}/login`;
    }
    if (!isMarketingHostname(window.location.host)) {
      return `${window.location.origin}/login`;
    }
  }
  return PRODUCTION_APP_LOGIN_URL;
}
