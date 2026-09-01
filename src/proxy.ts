import { NextResponse, type NextRequest } from "next/server";
import { isPublicAuthFlowPath, runAuthProxy } from "@/lib/auth-proxy";

/**
 * Next.js 16 Proxy entry — refreshes Supabase sessions and enforces RBAC redirects.
 * @see https://nextjs.org/docs/app/getting-started/proxy
 */
export async function proxy(request: NextRequest) {
  if (isPublicAuthFlowPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  return runAuthProxy(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
