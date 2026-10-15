"use server";

import { revalidatePath } from "next/cache";
import { sendEmail } from "@/lib/email-service";
import {
  parseMissingColumnFromError,
  stripMissingColumn,
} from "@/lib/form-payload-utils";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSiteUrl, isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { matchWorkerForAuthUser } from "@/lib/worker-auth-lookup";
import {
  buildGuestSwmsInviteEmail,
  buildGuestSwmsPortalUrl,
  GUEST_SWMS_PATH,
  isValidGuestEmail,
  normalizeGuestEmail,
  SWMS_GUEST_ASSIGNMENTS_TABLE,
  type GuestPendingSwmsItem,
  type SwmsGuestAssignmentRow,
} from "@/lib/swms-guest";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const OPTIONAL_NOTIFICATION_COLUMNS = [
  "recipient_id",
  "user_id",
  "worker_id",
  "is_read",
  "read",
  "metadata",
  "type",
] as const;

function requireAdmin() {
  if (!isSupabaseAdminConfigured()) {
    throw new Error("Server database access is not configured.");
  }
  return createSupabaseAdminClient();
}

async function resolveAssignedByWorkerId(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  user: { id: string; email?: string | null }
): Promise<{ workerId: string | null; error: string | null }> {
  const match = await matchWorkerForAuthUser(admin, user, {
    skipEmailLookup: false,
  });
  if (match?.workerId && UUID_RE.test(match.workerId)) {
    return { workerId: match.workerId, error: null };
  }

  const byPrimaryKey = await admin
    .from("workers")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (!byPrimaryKey.error && byPrimaryKey.data?.id) {
    return { workerId: String(byPrimaryKey.data.id), error: null };
  }

  return {
    workerId: null,
    error:
      "Worker profile not found for this account. Cannot send a SWMS to a guest until your user is linked to public.workers.",
  };
}

function asGuestRow(row: Record<string, unknown>): SwmsGuestAssignmentRow {
  const status = String(row.status ?? "pending").toLowerCase() === "signed"
    ? "signed"
    : "pending";
  return {
    id: String(row.id ?? ""),
    swms_id: String(row.swms_id ?? ""),
    guest_email: String(row.guest_email ?? ""),
    guest_name: row.guest_name ? String(row.guest_name) : null,
    signature_data: row.signature_data ? String(row.signature_data) : null,
    status,
    signed_at: row.signed_at ? String(row.signed_at) : null,
    assigned_by: row.assigned_by ? String(row.assigned_by) : null,
    created_at: row.created_at ? String(row.created_at) : null,
  };
}

async function loadSwmsMeta(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  swmsIds: string[]
): Promise<Map<string, { title: string; documentUrl: string; version: string | null }>> {
  const unique = [...new Set(swmsIds.filter((id) => UUID_RE.test(id)))];
  const map = new Map<string, { title: string; documentUrl: string; version: string | null }>();
  if (unique.length === 0) return map;

  const { data, error } = await admin
    .from("swms_documents")
    .select("id, title, version, file_url, doc_url")
    .in("id", unique);

  if (error || !data) return map;

  for (const row of data) {
    const record = row as Record<string, unknown>;
    const id = String(record.id ?? "");
    map.set(id, {
      title: String(record.title ?? "SWMS").trim() || "SWMS",
      documentUrl: String(record.doc_url || record.file_url || "").trim(),
      version: record.version ? String(record.version) : null,
    });
  }
  return map;
}

export async function assignSwmsToGuest(input: {
  swmsIds: string[];
  guestEmail: string;
  guestName?: string;
}): Promise<{ error: string | null; assignedCount: number }> {
  const swmsIds = [
    ...new Set(
      (input.swmsIds ?? [])
        .map((id) => id.trim())
        .filter((id) => UUID_RE.test(id))
    ),
  ];
  const guestEmail = normalizeGuestEmail(input.guestEmail);
  const guestName = input.guestName?.trim() || null;

  if (swmsIds.length === 0) {
    return { error: "Select at least one SWMS.", assignedCount: 0 };
  }
  if (!isValidGuestEmail(guestEmail)) {
    return { error: "Enter a valid guest email address.", assignedCount: 0 };
  }

  const server = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await server.auth.getUser();
  if (authError || !user) {
    return { error: "You must be signed in to send a SWMS to a guest.", assignedCount: 0 };
  }

  let admin;
  try {
    admin = requireAdmin();
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Server database access is not configured.",
      assignedCount: 0,
    };
  }

  const assignedBy = await resolveAssignedByWorkerId(admin, user);
  if (!assignedBy.workerId) {
    return {
      error: assignedBy.error ?? "Worker profile not found for this account.",
      assignedCount: 0,
    };
  }

  const existingPending = await admin
    .from(SWMS_GUEST_ASSIGNMENTS_TABLE)
    .select("swms_id")
    .in("swms_id", swmsIds)
    .ilike("guest_email", guestEmail)
    .eq("status", "pending");

  if (existingPending.error) {
    return { error: existingPending.error.message, assignedCount: 0 };
  }

  const alreadyPending = new Set(
    (existingPending.data ?? []).map((row) => String((row as { swms_id?: string }).swms_id ?? ""))
  );
  const toInsert = swmsIds.filter((id) => !alreadyPending.has(id));

  if (toInsert.length > 0) {
    const rows = toInsert.map((swmsId) => ({
      swms_id: swmsId,
      guest_email: guestEmail,
      ...(guestName ? { guest_name: guestName } : {}),
      status: "pending" as const,
      assigned_by: assignedBy.workerId,
    }));
    const { error } = await admin.from(SWMS_GUEST_ASSIGNMENTS_TABLE).insert(rows);
    if (error) {
      return { error: error.message, assignedCount: 0 };
    }
  }

  const meta = await loadSwmsMeta(admin, swmsIds);
  const swmsTitles = swmsIds.map((id) => meta.get(id)?.title || "SWMS");
  const portalUrl = buildGuestSwmsPortalUrl(getSiteUrl());
  const email = buildGuestSwmsInviteEmail({ swmsTitles, portalUrl });
  const sent = await sendEmail({
    to: [guestEmail],
    subject: email.subject,
    html: email.html,
    skipTeamFooter: true,
  });

  if (!sent.sent && sent.error && !sent.simulated) {
    return {
      error: `Assignment saved, but the email could not be sent: ${sent.error}`,
      assignedCount: swmsIds.length,
    };
  }

  revalidatePath("/admin/swms");
  return { error: null, assignedCount: swmsIds.length };
}

export async function lookupPendingGuestSwms(
  email: string
): Promise<{ error: string | null; assignments: GuestPendingSwmsItem[] }> {
  const guestEmail = normalizeGuestEmail(email);
  if (!isValidGuestEmail(guestEmail)) {
    return { error: "Enter a valid email address.", assignments: [] };
  }

  let admin;
  try {
    admin = requireAdmin();
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to look up SWMS.",
      assignments: [],
    };
  }

  const { data, error } = await admin
    .from(SWMS_GUEST_ASSIGNMENTS_TABLE)
    .select("id, swms_id, guest_email, status, created_at")
    .ilike("guest_email", guestEmail)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    return { error: error.message, assignments: [] };
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const meta = await loadSwmsMeta(
    admin,
    rows.map((row) => String(row.swms_id ?? ""))
  );

  const assignments: GuestPendingSwmsItem[] = rows.map((row) => {
    const swmsId = String(row.swms_id ?? "");
    const info = meta.get(swmsId);
    return {
      id: String(row.id ?? ""),
      swms_id: swmsId,
      guest_email: String(row.guest_email ?? guestEmail),
      created_at: row.created_at ? String(row.created_at) : null,
      swmsTitle: info?.title ?? "SWMS",
      swmsDocumentUrl: info?.documentUrl ?? "",
      version: info?.version ?? null,
    };
  });

  return { error: null, assignments };
}

export async function submitGuestSwmsSignature(input: {
  assignmentId: string;
  guestEmail: string;
  guestName: string;
  signatureData: string;
}): Promise<{ error: string | null }> {
  const assignmentId = input.assignmentId.trim();
  const guestEmail = normalizeGuestEmail(input.guestEmail);
  const guestName = input.guestName.trim();
  const signatureData = input.signatureData.trim();

  if (!UUID_RE.test(assignmentId)) {
    return { error: "Invalid assignment." };
  }
  if (!isValidGuestEmail(guestEmail)) {
    return { error: "Enter a valid email address." };
  }
  if (!guestName) {
    return { error: "Enter your name." };
  }
  if (!signatureData.startsWith("data:image")) {
    return { error: "Please sign before submitting." };
  }

  let admin;
  try {
    admin = requireAdmin();
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to save signature.",
    };
  }

  const existing = await admin
    .from(SWMS_GUEST_ASSIGNMENTS_TABLE)
    .select("id, swms_id, guest_email, status, assigned_by")
    .eq("id", assignmentId)
    .maybeSingle();

  if (existing.error) {
    return { error: existing.error.message };
  }
  if (!existing.data) {
    return { error: "This SWMS assignment was not found." };
  }

  const row = asGuestRow(existing.data as Record<string, unknown>);
  if (normalizeGuestEmail(row.guest_email) !== guestEmail) {
    return { error: "This SWMS is not assigned to that email address." };
  }
  if (row.status === "signed") {
    return { error: "This SWMS has already been signed." };
  }

  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from(SWMS_GUEST_ASSIGNMENTS_TABLE)
    .update({
      guest_name: guestName,
      signature_data: signatureData,
      status: "signed",
      signed_at: now,
    })
    .eq("id", assignmentId)
    .eq("status", "pending");

  if (updateError) {
    return { error: updateError.message };
  }

  const meta = await loadSwmsMeta(admin, [row.swms_id]);
  const swmsTitle = meta.get(row.swms_id)?.title ?? row.swms_id.slice(0, 8);
  await notifyAssignedWorker(admin, {
    assignedBy: row.assigned_by,
    guestName,
    swmsTitle,
    swmsId: row.swms_id,
  });

  revalidatePath(GUEST_SWMS_PATH);
  return { error: null };
}

async function notifyAssignedWorker(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  input: {
    assignedBy: string | null;
    guestName: string;
    swmsTitle: string;
    swmsId: string;
  }
): Promise<void> {
  const assignedBy = input.assignedBy?.trim() ?? "";
  if (!UUID_RE.test(assignedBy)) return;

  let workerId: string | null = null;
  let authUserId = assignedBy;

  const byId = await admin
    .from("workers")
    .select("id, auth_user_id")
    .eq("id", assignedBy)
    .maybeSingle();
  if (!byId.error && byId.data?.id) {
    workerId = String(byId.data.id);
    authUserId = String(byId.data.auth_user_id ?? assignedBy);
  } else {
    const byAuth = await admin
      .from("workers")
      .select("id, auth_user_id")
      .eq("auth_user_id", assignedBy)
      .maybeSingle();
    if (!byAuth.error && byAuth.data?.id) {
      workerId = String(byAuth.data.id);
      authUserId = String(byAuth.data.auth_user_id ?? assignedBy);
    }
  }

  const message = `Guest ${input.guestName} has signed SWMS ${input.swmsTitle}`;
  let payload: Record<string, unknown> = {
    user_id: authUserId,
    recipient_id: authUserId,
    worker_id: workerId,
    title: "Guest SWMS signed",
    message,
    type: "swms_guest_signed",
    read: false,
    is_read: false,
    metadata: {
      swms_id: input.swmsId,
      guest_name: input.guestName,
      sent_at: new Date().toISOString(),
    },
  };

  for (let attempt = 0; attempt <= OPTIONAL_NOTIFICATION_COLUMNS.length + 2; attempt += 1) {
    const { error } = await admin.from("notifications").insert([payload]);
    if (!error) return;
    const missing = parseMissingColumnFromError(error.message);
    if (missing && missing in payload) {
      payload = stripMissingColumn(payload, missing);
      continue;
    }
    console.warn("[swms-guest] notification insert failed:", error.message);
    return;
  }
}
