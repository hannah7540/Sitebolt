export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { requireAuthenticatedWorkerAccess } from "@/lib/swms-api-auth";
import { fetchWorkerSwmsAssignmentsAdmin } from "@/lib/swms-admin-mutations";

export async function GET() {
  const access = await requireAuthenticatedWorkerAccess();
  if (!access.ok) return access.response;

  const { assignments, error } = await fetchWorkerSwmsAssignmentsAdmin(
    access.admin,
    access.workerId
  );

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  const pending = assignments.filter(
    (row) => String(row.status ?? "") === "Pending"
  );
  const signed = assignments.filter(
    (row) => String(row.status ?? "") === "Signed"
  );

  return NextResponse.json({
    assignments,
    pending,
    signed,
    pendingCount: pending.length,
  });
}
