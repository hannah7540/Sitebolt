export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { unstable_noStore as noStore } from "next/cache";
import { NextResponse } from "next/server";
import { listPendingResourceApprovals } from "@/app/actions/resource-approvals";

export async function GET() {
  noStore();
  const items = await listPendingResourceApprovals();
  return NextResponse.json(
    { items, count: items.length },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
