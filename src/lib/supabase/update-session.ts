import { runAuthProxy } from "@/lib/auth-proxy";

/** @deprecated Use runAuthProxy from auth-proxy.ts directly. */
export async function updateSession(request: Parameters<typeof runAuthProxy>[0]) {
  return runAuthProxy(request);
}
