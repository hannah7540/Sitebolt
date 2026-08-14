export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { processWorkerProjectReallocation } from "@/lib/worker-project-reallocation";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      workerId?: string;
      projectId?: string;
      projectName?: string;
      effectiveDate?: string;
      previousProjectId?: string | null;
    };

    const workerId = body.workerId?.trim();
    const projectId = body.projectId?.trim();
    const projectName = body.projectName?.trim();
    const effectiveDate = body.effectiveDate?.trim();

    if (!workerId || !projectId || !projectName || !effectiveDate) {
      return NextResponse.json(
        {
          error:
            "workerId, projectId, projectName, and effectiveDate are required.",
        },
        { status: 400 }
      );
    }

    const result = await processWorkerProjectReallocation({
      workerId,
      projectId,
      projectName,
      effectiveDate,
      previousProjectId: body.previousProjectId ?? null,
    });

    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
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
