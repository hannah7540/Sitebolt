export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { handleAuthConfirmRequest } from "@/lib/auth-confirm-handler";

export async function GET(request: Request) {
  return handleAuthConfirmRequest(request);
}

export async function POST(request: Request) {
  return handleAuthConfirmRequest(request);
}

export async function HEAD() {
  return new Response(null, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}