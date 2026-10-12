/** Sent alongside Authorization when a WebView drops the standard bearer header. */
export const SITEBOLT_ACCESS_TOKEN_HEADER = "x-sitebolt-access-token";

/** Access token from Authorization or the native WebView fallback header. */
export function readRequestAccessToken(req: Request): string {
  const authorization = req.headers.get("authorization") ?? "";
  if (/^bearer\s+/i.test(authorization)) {
    const token = authorization.replace(/^bearer\s+/i, "").trim();
    if (token) return token;
  }

  return req.headers.get(SITEBOLT_ACCESS_TOKEN_HEADER)?.trim() ?? "";
}
