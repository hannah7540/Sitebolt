export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { linkWorkerAuthAccount } from "@/lib/worker-auth-email";
import {
  buildFallbackOnboardingRecord,
  ensureWorkerProfileForAuthUser,
  loadWorkerForOnboardingRecord,
} from "@/lib/ensure-worker-profile";
import { buildWorkerNameFields, splitWorkerFullName } from "@/lib/worker-utils";

async function resolveOnboardingWorker(user: User | null) {
  if (!user) {
    return { error: "Not authenticated.", status: 401 as const, worker: null };
  }

  const admin = createSupabaseAdminClient();
  const ensured = await ensureWorkerProfileForAuthUser(admin, user);
  if (ensured.error || !ensured.workerId) {
    return {
      error: ensured.error ?? "Worker profile not found.",
      status: 400 as const,
      worker: null,
    };
  }

  const worker =
    (await loadWorkerForOnboardingRecord(admin, ensured.workerId)) ??
    buildFallbackOnboardingRecord(ensured.workerId, user);

  return { error: null, status: 200 as const, worker };
}

export async function GET() {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Server configuration error." },
      { status: 500 }
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const result = await resolveOnboardingWorker(user);
  if (result.error || !result.worker) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ worker: result.worker });
}

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Server configuration error." },
      { status: 500 }
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const trade = typeof body?.trade === "string" ? body.trade.trim() : "";
  const emergencyContactName =
    typeof body?.emergencyContactName === "string"
      ? body.emergencyContactName.trim()
      : "";
  const emergencyContactPhone =
    typeof body?.emergencyContactPhone === "string"
      ? body.emergencyContactPhone.trim()
      : "";
  const whiteCardNumber =
    typeof body?.whiteCardNumber === "string" ? body.whiteCardNumber.trim() : "";
  const driversLicenceNumber =
    typeof body?.driversLicenceNumber === "string"
      ? body.driversLicenceNumber.trim()
      : "";

  if (!fullName) {
    return NextResponse.json({ error: "Full name is required." }, { status: 400 });
  }
  if (!phone) {
    return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
  }
  if (!emergencyContactName || !emergencyContactPhone) {
    return NextResponse.json(
      { error: "Emergency contact name and phone are required." },
      { status: 400 }
    );
  }
  if (!trade) {
    return NextResponse.json({ error: "Trade / role is required." }, { status: 400 });
  }

  const resolved = await resolveOnboardingWorker(user);
  if (resolved.error || !resolved.worker) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const workerId = resolved.worker.id;
  const admin = createSupabaseAdminClient();
  const { firstName, lastName } = splitWorkerFullName(fullName);
  const nameFields = buildWorkerNameFields(firstName, lastName);

  const updatePayload: Record<string, unknown> = {
    ...nameFields,
    phone,
    trade,
    emergency_contact_name: emergencyContactName,
    emergency_contact_phone: emergencyContactPhone,
    white_card_number: whiteCardNumber || null,
    drivers_licence_number: driversLicenceNumber || null,
    onboarding_completed: true,
    status: "active",
    updated_at: new Date().toISOString(),
  };

  let { error: updateError } = await admin
    .from("workers")
    .update(updatePayload)
    .eq("id", workerId);

  if (
    updateError &&
    updateError.message.toLowerCase().includes("onboarding_completed")
  ) {
    const fallbackPayload = { ...updatePayload };
    delete fallbackPayload.onboarding_completed;
    ({ error: updateError } = await admin
      .from("workers")
      .update(fallbackPayload)
      .eq("id", workerId));
  }

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  const { data: workerMeta } = await admin
    .from("workers")
    .select("email, security_role")
    .eq("id", workerId)
    .maybeSingle();

  await linkWorkerAuthAccount(admin, {
    workerId,
    authUserId: user.id,
    email: user.email ?? workerMeta?.email ?? resolved.worker.email ?? "",
    fullName: nameFields.full_name,
    securityRole:
      workerMeta && typeof workerMeta.security_role === "string"
        ? workerMeta.security_role
        : null,
  });

  return NextResponse.json({ success: true, workerId });
}
