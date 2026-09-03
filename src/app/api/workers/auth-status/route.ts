import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { markWorkerAccountActivated } from "@/lib/ensure-worker-profile";

export async function POST(request: Request) {
  try {
    if (!isSupabaseAdminConfigured()) {
      return NextResponse.json(
        { error: "Supabase service role is not configured." },
        { status: 503 }
      );
    }

    const body = (await request.json()) as {
      entries?: Array<{ workerId?: string; authUserId?: string | null }>;
    };

    const entries = body.entries ?? [];
    const admin = createSupabaseAdminClient();
    const lastSignInByWorkerId: Record<string, string | null> = {};
    const syncedWorkerIds: string[] = [];

    await Promise.all(
      entries.map(async (entry) => {
        const workerId = entry.workerId?.trim();
        if (!workerId) return;

        const authUserId = entry.authUserId?.trim();
        if (!authUserId) {
          lastSignInByWorkerId[workerId] = null;
          return;
        }

        const { data, error } = await admin.auth.admin.getUserById(authUserId);
        if (error || !data.user) {
          lastSignInByWorkerId[workerId] = null;
          return;
        }

        const lastSignInAt = data.user.last_sign_in_at ?? null;
        lastSignInByWorkerId[workerId] = lastSignInAt;

        const emailConfirmed = Boolean(data.user.email_confirmed_at);
        if (lastSignInAt || emailConfirmed) {
          const { data: workerRow } = await admin
            .from("workers")
            .select("onboarding_completed")
            .eq("id", workerId)
            .maybeSingle();
          const syncResult = await markWorkerAccountActivated(admin, workerId, {
            completeOnboarding: workerRow?.onboarding_completed === true,
            acceptInvite: true,
          });
          if (!syncResult.error) {
            syncedWorkerIds.push(workerId);
          }
        }
      })
    );

    return NextResponse.json({ lastSignInByWorkerId, syncedWorkerIds });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load worker auth status.",
      },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
