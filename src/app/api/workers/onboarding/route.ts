export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { linkWorkerAuthAccount } from "@/lib/worker-auth-email";
import {
  buildFallbackOnboardingRecord,
  ensureWorkerProfileForAuthUser,
  loadWorkerForOnboardingRecord,
  markWorkerAccountActivated,
} from "@/lib/ensure-worker-profile";
import { buildWorkerNameFields, splitWorkerFullName } from "@/lib/worker-utils";
import { assignDefaultPayRuleToWorkerAdmin } from "@/lib/worker-pay-rule-assignment";
import { normalizeWorkerStateRegion } from "@/lib/worker-state-region";
import type { WorkerOnboardingFormPayload } from "@/lib/worker-onboarding";
import {
  isValidProfilePhotoUrl,
  PROFILE_PHOTO_API_REQUIRED_MESSAGE,
} from "@/lib/worker-profile-photo-validation";

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullIfBlank(value: string): string | null {
  return value.trim() ? value.trim() : null;
}

function nullIfBlankDate(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseOnboardingPayload(body: unknown): WorkerOnboardingFormPayload | null {
  if (!body || typeof body !== "object") return null;

  const raw = body as Record<string, unknown>;
  const rawVocs = Array.isArray(raw.vocs) ? raw.vocs : [];

  return {
    fullName: readString(raw.fullName),
    email: readString(raw.email),
    phone: readString(raw.phone),
    address: readString(raw.address),
    state: readString(raw.state),
    emergencyContactName: readString(raw.emergencyContactName),
    emergencyContactRelationship: readString(raw.emergencyContactRelationship),
    emergencyContactPhone: readString(raw.emergencyContactPhone),
    bankName: readString(raw.bankName),
    bankBsb: readString(raw.bankBsb),
    bankAccountNumber: readString(raw.bankAccountNumber),
    superFund: readString(raw.superFund),
    superMemberNumber: readString(raw.superMemberNumber),
    superUsi: readString(raw.superUsi),
    tfn: readString(raw.tfn),
    redundancyFundName: readString(raw.redundancyFundName),
    redundancyMemberNumber: readString(raw.redundancyMemberNumber),
    whiteCardNumber: readString(raw.whiteCardNumber),
    whiteCardState: readString(raw.whiteCardState),
    silicaCertNumber: readString(raw.silicaCertNumber),
    silicaCertIssueDate: readString(raw.silicaCertIssueDate),
    driversLicenceNumber: readString(raw.driversLicenceNumber),
    driversLicenceClass: readString(raw.driversLicenceClass),
    driversLicenceExpiry: readString(raw.driversLicenceExpiry),
    photoUrl: readString(raw.photoUrl),
    vocs: rawVocs
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const voc = item as Record<string, unknown>;
        const vocType = readString(voc.voc_type ?? voc.title);
        if (!vocType) return null;
        return {
          title: vocType,
          voc_type: vocType,
          issuing_org: nullIfBlank(readString(voc.issuing_org)),
          issue_date: nullIfBlankDate(readString(voc.issue_date)),
          expiry_date: nullIfBlankDate(readString(voc.expiry_date)),
          document_url: nullIfBlank(readString(voc.document_url)),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null),
  };
}

function validateOnboardingPayload(payload: WorkerOnboardingFormPayload): string | null {
  if (!payload.fullName) return "Full name is required.";
  if (!payload.phone) return "Phone number is required.";
  if (!payload.address) return "Address is required.";
  if (!normalizeWorkerStateRegion(payload.state)) {
    return "State / Region is required.";
  }
  if (!payload.emergencyContactName) return "Emergency contact name is required.";
  if (!payload.emergencyContactRelationship) {
    return "Emergency contact relationship is required.";
  }
  if (!payload.emergencyContactPhone) return "Emergency contact phone is required.";
  if (!payload.bankName) return "Bank name is required.";
  if (!payload.bankBsb) return "Bank BSB is required.";
  if (!payload.bankAccountNumber) return "Bank account number is required.";
  if (!payload.superFund) return "Superannuation fund name is required.";
  if (!payload.superMemberNumber) return "Super member number is required.";
  if (!payload.tfn) return "Tax File Number is required.";
  if (!isValidProfilePhotoUrl(payload.photoUrl)) {
    return PROFILE_PHOTO_API_REQUIRED_MESSAGE;
  }
  return null;
}

async function replaceWorkerVocs(
  admin: SupabaseClient,
  workerId: string,
  vocs: WorkerOnboardingFormPayload["vocs"]
): Promise<string | null> {
  const { error: deleteError } = await admin
    .from("worker_vocs")
    .delete()
    .eq("worker_id", workerId);

  if (deleteError) return deleteError.message;
  if (vocs.length === 0) return null;

  const rows = vocs.map((voc) => ({
    worker_id: workerId,
    title: voc.title,
    voc_type: voc.voc_type ?? voc.title,
    name: voc.voc_type ?? voc.title,
    issuing_org: voc.issuing_org ?? null,
    issue_date: voc.issue_date ?? null,
    expiry_date: voc.expiry_date ?? null,
    document_url: voc.document_url ?? null,
  }));

  const attempts = [
    rows,
    rows.map(({ name: _name, voc_type: _vocType, ...row }) => row),
    rows.map(({ name: _name, ...row }) => row),
  ];

  for (const payload of attempts) {
    const { error } = await admin.from("worker_vocs").insert(payload);
    if (!error) return null;
    const lower = error.message.toLowerCase();
    if (
      !lower.includes("column") &&
      !lower.includes("schema cache") &&
      !lower.includes("could not find")
    ) {
      return error.message;
    }
  }

  return "Unable to save VOC records.";
}

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

  const payload = parseOnboardingPayload(await req.json().catch(() => null));
  if (!payload) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const validationError = validateOnboardingPayload(payload);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const resolved = await resolveOnboardingWorker(user);
  if (resolved.error || !resolved.worker) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const workerId = resolved.worker.id;
  const admin = createSupabaseAdminClient();

  let photoUrl = payload.photoUrl.trim();
  if (!isValidProfilePhotoUrl(photoUrl)) {
    const { data: existingWorker } = await admin
      .from("workers")
      .select("photo_url")
      .eq("id", workerId)
      .maybeSingle();
    if (isValidProfilePhotoUrl(existingWorker?.photo_url as string | null | undefined)) {
      photoUrl = String(existingWorker?.photo_url).trim();
    }
  }

  if (!isValidProfilePhotoUrl(photoUrl)) {
    return NextResponse.json(
      { error: PROFILE_PHOTO_API_REQUIRED_MESSAGE },
      { status: 400 }
    );
  }

  const { firstName, lastName } = splitWorkerFullName(payload.fullName);
  const nameFields = buildWorkerNameFields(firstName, lastName);

  const workerStateRaw =
    nullIfBlank(payload.whiteCardState) ??
    nullIfBlank(payload.state) ??
    null;
  const workerState = workerStateRaw
    ? normalizeWorkerStateRegion(workerStateRaw) ?? workerStateRaw.trim().toUpperCase()
    : null;

  const { error: updateError } = await admin
    .from("workers")
    .update({
      ...nameFields,
      phone: payload.phone,
      emergency_contact: payload.address,
      emergency_contact_name: payload.emergencyContactName,
      emergency_contact_relationship: payload.emergencyContactRelationship,
      emergency_contact_phone: payload.emergencyContactPhone,
      bank_name: payload.bankName,
      bank_bsb: payload.bankBsb,
      bank_account_number: payload.bankAccountNumber,
      super_fund: payload.superFund,
      super_member_number: payload.superMemberNumber,
      super_usi: nullIfBlank(payload.superUsi),
      tfn: payload.tfn,
      redundancy_fund_name: nullIfBlank(payload.redundancyFundName),
      redundancy_member_number: nullIfBlank(payload.redundancyMemberNumber),
      white_card_number: nullIfBlank(payload.whiteCardNumber),
      state: workerState,
      silica_cert_number: nullIfBlank(payload.silicaCertNumber),
      silica_cert_issue_date: nullIfBlankDate(payload.silicaCertIssueDate),
      drivers_licence_number: nullIfBlank(payload.driversLicenceNumber),
      drivers_licence_class: nullIfBlank(payload.driversLicenceClass),
      drivers_licence_expiry: nullIfBlankDate(payload.driversLicenceExpiry),
      photo_url: photoUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workerId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  // Pay rule is never submitted from the form — derive template from worker state/region.
  const payRuleState =
    nullIfBlank(payload.state) ??
    nullIfBlank(payload.whiteCardState) ??
    workerState;
  if (payRuleState) {
    await assignDefaultPayRuleToWorkerAdmin(admin, workerId, payRuleState);
  }

  const vocError = await replaceWorkerVocs(admin, workerId, payload.vocs);
  if (vocError) {
    return NextResponse.json({ error: vocError }, { status: 400 });
  }

  const activationResult = await markWorkerAccountActivated(admin, workerId, {
    completeOnboarding: true,
  });

  if (activationResult.error) {
    return NextResponse.json({ error: activationResult.error }, { status: 400 });
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
