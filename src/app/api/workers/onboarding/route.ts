export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { linkWorkerAuthAccount } from "@/lib/worker-auth-email";
import { ensureWorkerProfileForAuthUser } from "@/lib/ensure-worker-profile";
import {
  type WorkerOnboardingRecord,
} from "@/lib/worker-onboarding";
import { buildWorkerNameFields, splitWorkerFullName } from "@/lib/worker-utils";

const WORKER_ONBOARDING_SELECT =
  "id, email, full_name, first_name, last_name, phone, trade, emergency_contact_name, emergency_contact_phone, white_card_number, drivers_licence_number, onboarding_completed";

async function loadWorkerForOnboarding(
  workerId: string
): Promise<WorkerOnboardingRecord | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("workers")
    .select(WORKER_ONBOARDING_SELECT)
    .eq("id", workerId)
    .maybeSingle();

  if (error || !data) return null;
  return data as WorkerOnboardingRecord;
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

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const ensured = await ensureWorkerProfileForAuthUser(admin, user);
  if (ensured.error || !ensured.workerId) {
    return NextResponse.json(
      { error: ensured.error ?? "Worker profile not found." },
      { status: 400 }
    );
  }

  const worker = await loadWorkerForOnboarding(ensured.workerId);
  if (!worker) {
    return NextResponse.json({ error: "Worker profile not found." }, { status: 404 });
  }

  return NextResponse.json({ worker });
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

  const admin = createSupabaseAdminClient();
  const ensured = await ensureWorkerProfileForAuthUser(admin, user);
  if (ensured.error || !ensured.workerId) {
    return NextResponse.json(
      { error: ensured.error ?? "Worker profile not found." },
      { status: 400 }
    );
  }

  const workerId = ensured.workerId;

  const { firstName, lastName } = splitWorkerFullName(fullName);
  const nameFields = buildWorkerNameFields(firstName, lastName);

  const { error: updateError } = await admin
    .from("workers")
    .update({
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
    })
    .eq("id", workerId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  const worker = await loadWorkerForOnboarding(workerId);

  const { data: workerMeta } = await admin
    .from("workers")
    .select("email, security_role")
    .eq("id", workerId)
    .maybeSingle();

  await linkWorkerAuthAccount(admin, {
    workerId,
    authUserId: user.id,
    email: user.email ?? workerMeta?.email ?? worker?.email ?? "",
    fullName: nameFields.full_name,
    securityRole:
      workerMeta && typeof workerMeta.security_role === "string"
        ? workerMeta.security_role
        : null,
  });

  return NextResponse.json({ success: true, workerId });
}
