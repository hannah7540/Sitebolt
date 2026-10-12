import { NextResponse } from "next/server";

/** Keep Android WebView from replaying a stale profile 404. */
export const PROFILE_API_CACHE_CONTROL = "no-store, must-revalidate";

export function profileApiJson(
  body: unknown,
  statusOrInit: number | { status?: number } = 200
) {
  const status =
    typeof statusOrInit === "number" ? statusOrInit : statusOrInit.status ?? 200;
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": PROFILE_API_CACHE_CONTROL,
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
