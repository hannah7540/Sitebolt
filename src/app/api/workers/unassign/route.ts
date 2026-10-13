export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { unassignWorkerFromAllProjects } from "@/lib/unassign-worker-projects";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { workerId?: string };
    const workerId = body.workerId?.trim();

    if (!workerId) {
      return NextResponse.json({ error: "workerId is required." }, { status: 400 });
    }

    const result = await unassignWorkerFromAllProjects(workerId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      closedAssignmentCount: result.closedAssignmentCount,
      message: "Worker unassigned from all projects.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to unassign worker from projects.",
      },
      { status: 500 }
    );
  }
}
