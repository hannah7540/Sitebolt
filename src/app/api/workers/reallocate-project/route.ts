export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { moveWorkerToProject } from "@/lib/worker-project-move";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      workerId?: string;
      projectId?: string;
      projectName?: string;
      startDate?: string;
      effectiveDate?: string;
      previousProjectId?: string | null;
      roleOnSite?: string | null;
    };

    const workerId = body.workerId?.trim();
    const projectId = body.projectId?.trim();
    const projectName = body.projectName?.trim();
    const startDate = (body.startDate ?? body.effectiveDate)?.trim();

    if (!workerId || !projectId || !projectName || !startDate) {
      return NextResponse.json(
        {
          error:
            "workerId, projectId, projectName, and startDate are required.",
        },
        { status: 400 }
      );
    }

    const result = await moveWorkerToProject({
      workerId,
      projectId,
      projectName,
      startDate,
      previousProjectId: body.previousProjectId ?? null,
      roleOnSite: body.roleOnSite ?? null,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to process worker reallocation.",
      },
      { status: 500 }
    );
  }
}
