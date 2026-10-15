import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "./email-service";
import { getSiteUrl } from "./supabase/env";
import {
  parseMissingColumnFromError,
  stripMissingColumn,
} from "./form-payload-utils";
import {
  isSupabaseMissingColumnError,
  isSupabaseRelationMissingError,
  isSupabaseSchemaCacheError,
} from "./supabase-errors";
import { fetchWorkers, type Worker } from "./supabase";
import { fetchExpiryAlertSettings } from "./expiry-alert-settings";
import { normalizeSecurityRole } from "./security-roles";
import { filterRowsByOrganisation } from "./tenant-scope";
import { buildWorkerFullName, formatWorkerBsb, getWorkerDisplayName } from "./worker-utils";
import type { ComplianceAlertItem } from "./compliance-alerts-hub";

function profileAlertRecipients(workers: Worker[], settings: Awaited<ReturnType<typeof fetchExpiryAlertSettings>>): string[] {
  const designatedEmails = workers
    .filter(
      (worker) =>
        settings.notification_recipient_worker_ids.includes(worker.id) &&
        Boolean(worker.email?.trim()) &&
        !worker.is_revoked &&
        !worker.is_archived
    )
    .map((worker) => worker.email!.trim());

  if (designatedEmails.length > 0) {
    return [...new Set([...designatedEmails, ...(settings.secondary_recipient_emails ?? [])])];
  }

  const adminEmails = workers
    .filter((worker) => {
      const role = normalizeSecurityRole(worker.security_role);
      const active = !worker.is_revoked && !worker.is_archived && worker.status !== "pending_induction";
      return (
        (role === "full_access" ||
          role === "master_admin" ||
          role === "project_team") &&
        active &&
        Boolean(worker.email?.trim())
      );
    })
    .map((worker) => worker.email.trim());

  return [...new Set([...adminEmails, ...(settings.secondary_recipient_emails ?? [])])];
}

export const WORKER_PROFILE_ALERT_TYPE = "worker_profile_update";

const OPTIONAL_NOTIFICATION_COLUMNS = [
  "worker_id",
  "recipient_id",
  "user_id",
  "is_read",
  "read",
  "metadata",
  "type",
] as const;

export type WorkerProfileChange = {
  field: string;
  before?: string | null;
  after?: string | null;
  masked: boolean;
  summary?: string;
};

export type WorkerProfileSnapshot = {
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  suburb: string | null;
  postcode: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_bsb: string | null;
  bank_account_number: string | null;
  super_fund: string | null;
  super_member_number: string | null;
  tfn: string | null;
};

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function same(left: string | null | undefined, right: string | null | undefined): boolean {
  return normalize(left) === normalize(right);
}

function displayOrDash(value: string | null | undefined): string {
  return normalize(value) || "—";
}

function formatAddress(snapshot: Pick<
  WorkerProfileSnapshot,
  "address_line_1" | "address_line_2" | "suburb" | "postcode"
>): string {
  const parts = [
    snapshot.address_line_1,
    snapshot.address_line_2,
    snapshot.suburb,
    snapshot.postcode,
  ]
    .map((part) => normalize(part))
    .filter(Boolean);
  return parts.join(", ") || "—";
}

function formatEmergency(snapshot: Pick<
  WorkerProfileSnapshot,
  "emergency_contact_name" | "emergency_contact_phone"
>): string {
  const parts = [snapshot.emergency_contact_name, snapshot.emergency_contact_phone]
    .map((part) => normalize(part))
    .filter(Boolean);
  return parts.join(" · ") || "—";
}

function workerName(snapshot: WorkerProfileSnapshot): string {
  return (
    asText(snapshot.full_name) ||
    buildWorkerFullName(snapshot.first_name, snapshot.last_name) ||
    asText(snapshot.email) ||
    "Worker"
  );
}

function pushChange(
  changes: WorkerProfileChange[],
  field: string,
  before: string | null | undefined,
  after: string | null | undefined
) {
  if (same(before, after)) return;
  changes.push({
    field,
    before: displayOrDash(before),
    after: displayOrDash(after),
    masked: false,
  });
}

export function mapWorkerRowToProfileSnapshot(row: Record<string, unknown>): WorkerProfileSnapshot {
  return {
    first_name: asText(row.first_name),
    last_name: asText(row.last_name),
    full_name: asText(row.full_name),
    email: asText(row.email),
    phone: asText(row.phone),
    address_line_1: asText(row.address_line_1),
    address_line_2: asText(row.address_line_2),
    suburb: asText(row.suburb),
    postcode: asText(row.postcode),
    emergency_contact_name: asText(row.emergency_contact_name),
    emergency_contact_phone: asText(row.emergency_contact_phone),
    bank_name: asText(row.bank_name),
    bank_account_name: asText(row.bank_account_name),
    bank_bsb: asText(row.bank_bsb),
    bank_account_number: asText(row.bank_account_number),
    super_fund: asText(row.super_fund),
    super_member_number: asText(row.super_member_number),
    tfn: asText(row.tfn),
  };
}

export function diffWorkerPersonalFinancialChanges(
  before: WorkerProfileSnapshot,
  after: WorkerProfileSnapshot
): WorkerProfileChange[] {
  const changes: WorkerProfileChange[] = [];

  pushChange(changes, "Name", workerName(before), workerName(after));
  pushChange(changes, "Email", before.email, after.email);
  pushChange(changes, "Phone", before.phone, after.phone);
  pushChange(changes, "Address", formatAddress(before), formatAddress(after));
  pushChange(
    changes,
    "Emergency Contact",
    formatEmergency(before),
    formatEmergency(after)
  );
  pushChange(changes, "Bank Name", before.bank_name, after.bank_name);
  pushChange(changes, "Account Name", before.bank_account_name, after.bank_account_name);
  pushChange(
    changes,
    "BSB",
    formatWorkerBsb(before.bank_bsb) ?? before.bank_bsb,
    formatWorkerBsb(after.bank_bsb) ?? after.bank_bsb
  );

  if (!same(before.bank_account_number, after.bank_account_number)) {
    changes.push({
      field: "Bank Account Number",
      masked: true,
      summary: "Bank Account Number was updated",
    });
  }

  pushChange(changes, "Superannuation Fund", before.super_fund, after.super_fund);
  pushChange(
    changes,
    "Super Member Number",
    before.super_member_number,
    after.super_member_number
  );

  if (!same(before.tfn, after.tfn)) {
    changes.push({
      field: "TFN",
      masked: true,
      summary: "TFN was updated",
    });
  }

  return changes;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function changeLine(change: WorkerProfileChange): string {
  if (change.summary) return change.summary;
  return `${change.field}: ${change.before ?? "—"} → ${change.after ?? "—"}`;
}

function buildProfileUpdateEmail(
  workerDisplayName: string,
  changes: WorkerProfileChange[]
): { subject: string; html: string; text: string } {
  const alertsUrl = `${getSiteUrl()}/organisation/alerts`;
  const subject = `[Action Required] SiteBolt Alert: ${workerDisplayName} updated profile details`;
  const rows = changes
    .map((change) => `<li>${escapeHtml(changeLine(change))}</li>`)
    .join("");

  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;max-width:720px;">
      <h2 style="color:#ea580c;margin-bottom:8px;">Worker profile update</h2>
      <p style="color:#475569;margin:0 0 12px;">
        <strong>${escapeHtml(workerDisplayName)}</strong> updated personal or financial details.
        Review the changes in Organisation Alerts and mark the item as Reviewed.
      </p>
      <ul style="color:#334155;line-height:1.6;">${rows}</ul>
      <p style="margin:24px 0 8px;">
        <a href="${escapeHtml(alertsUrl)}"
           style="display:inline-block;background:#ea580c;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700;font-size:14px;">
          Open Organisation Alerts
        </a>
      </p>
      <p style="color:#64748b;font-size:12px;">Or open: ${escapeHtml(alertsUrl)}</p>
    </div>`;

  const text = [
    `Worker profile update`,
    ``,
    `${workerDisplayName} updated personal or financial details.`,
    ...changes.map((change) => `- ${changeLine(change)}`),
    ``,
    `Open Organisation Alerts: ${alertsUrl}`,
  ].join("\n");

  return { subject, html, text };
}

async function insertProfileNotification(
  admin: SupabaseClient,
  input: {
    workerId: string;
    workerName: string;
    changes: WorkerProfileChange[];
  }
): Promise<{ error: string | null }> {
  const changedFields = input.changes.map((change) => change.field);
  let payload: Record<string, unknown> = {
    worker_id: input.workerId,
    title: `${input.workerName} updated personal or financial details`,
    message: `Changed: ${changedFields.join(", ")}`,
    type: WORKER_PROFILE_ALERT_TYPE,
    read: false,
    is_read: false,
    metadata: {
      alertKind: WORKER_PROFILE_ALERT_TYPE,
      workerId: input.workerId,
      workerName: input.workerName,
      changes: input.changes,
      changedFields,
    },
  };

  for (let attempt = 0; attempt <= OPTIONAL_NOTIFICATION_COLUMNS.length + 2; attempt += 1) {
    const { error } = await admin.from("notifications").insert([payload]);
    if (!error) return { error: null };

    if (isSupabaseMissingColumnError(error)) {
      const parsed = parseMissingColumnFromError(error.message);
      if (parsed && parsed in payload) {
        payload = stripMissingColumn(payload, parsed);
        continue;
      }
    }
    if (isSupabaseRelationMissingError(error) || isSupabaseSchemaCacheError(error)) {
      return { error: null };
    }
    return { error: error.message };
  }

  return { error: "Failed to log profile update alert." };
}

async function notifyProfileUpdateRecipients(
  workerDisplayName: string,
  organisationId: string | null,
  changes: WorkerProfileChange[]
): Promise<void> {
  if (!organisationId) return;

  const settings = await fetchExpiryAlertSettings();
  if (!settings.automated_emails_enabled) return;

  const workers = await fetchWorkers();
  const recipients = profileAlertRecipients(
    filterRowsByOrganisation(workers, organisationId),
    settings
  );
  if (recipients.length === 0) return;

  const email = buildProfileUpdateEmail(workerDisplayName, changes);
  await sendEmail({
    to: recipients,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
}

export async function logWorkerProfileUpdateAlert(input: {
  admin: SupabaseClient;
  workerId: string;
  organisationId: string | null;
  before: WorkerProfileSnapshot;
  after: WorkerProfileSnapshot;
}): Promise<{ error: string | null; changes: WorkerProfileChange[] }> {
  const changes = diffWorkerPersonalFinancialChanges(input.before, input.after);
  if (changes.length === 0) {
    return { error: null, changes };
  }

  const workerDisplayName = workerName(input.after) || workerName(input.before);
  const inserted = await insertProfileNotification(input.admin, {
    workerId: input.workerId,
    workerName: workerDisplayName,
    changes,
  });
  if (inserted.error) {
    return { error: inserted.error, changes };
  }

  try {
    await notifyProfileUpdateRecipients(workerDisplayName, input.organisationId, changes);
  } catch (cause) {
    console.error("[worker-profile-alerts] email dispatch failed:", cause);
  }

  return { error: null, changes };
}

function isUnreadNotification(row: Record<string, unknown>): boolean {
  if (row.is_read === true || row.read === true) return false;
  return true;
}

function parseChanges(metadata: unknown): WorkerProfileChange[] {
  if (!metadata || typeof metadata !== "object") return [];
  const raw = (metadata as { changes?: unknown }).changes;
  if (!Array.isArray(raw)) return [];
  const changes: WorkerProfileChange[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const field = asText(rec.field);
    if (!field) continue;
    changes.push({
      field,
      before: asText(rec.before),
      after: asText(rec.after),
      masked: rec.masked === true,
      summary: asText(rec.summary) ?? undefined,
    });
  }
  return changes;
}

export function mapProfileNotificationToAlert(
  row: Record<string, unknown>,
  worker: Worker | undefined
): ComplianceAlertItem {
  const metadata =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : {};
  const changes = parseChanges(metadata);
  const createdAt = asText(row.created_at) ?? new Date().toISOString();
  const workerNameLabel =
    asText(metadata.workerName) ||
    (worker ? getWorkerDisplayName(worker) : null) ||
    "Worker";

  return {
    id: String(row.id),
    category: "worker_profile_update",
    filterGroup: "worker_profile_update",
    title: workerNameLabel,
    subtitle: changes.map((change) => change.field).join(", ") || "Personal & Financial",
    documentLabel: "Personal & Financial",
    expiryDate: createdAt.slice(0, 10),
    daysRemaining: 0,
    statusLabel: "Needs Review",
    statusTone: "warning",
    sourceType: "worker",
    sourceId: asText(row.worker_id) ?? asText(metadata.workerId) ?? "",
    metadata: {
      alertKind: WORKER_PROFILE_ALERT_TYPE,
      notificationId: String(row.id),
      createdAt,
      changes,
      actionLabel: "View Changes",
      navigationHref: "/organisation/alerts",
    },
  };
}

export async function fetchWorkerProfileUpdateAlerts(input: {
  admin: SupabaseClient;
  workers: Worker[];
}): Promise<ComplianceAlertItem[]> {
  const allowedWorkerIds = new Set(input.workers.map((worker) => worker.id));
  if (allowedWorkerIds.size === 0) return [];

  const { data, error } = await input.admin
    .from("notifications")
    .select("id, worker_id, title, message, type, read, is_read, metadata, created_at")
    .eq("type", WORKER_PROFILE_ALERT_TYPE)
    .order("created_at", { ascending: false });

  if (error) {
    if (
      isSupabaseRelationMissingError(error) ||
      isSupabaseSchemaCacheError(error) ||
      isSupabaseMissingColumnError(error)
    ) {
      return [];
    }
    console.warn("[worker-profile-alerts] fetch failed:", error.message);
    return [];
  }

  const workersById = new Map(input.workers.map((worker) => [worker.id, worker]));

  return (data ?? [])
    .map((row) => row as Record<string, unknown>)
    .filter((row) => isUnreadNotification(row))
    .filter((row) => {
      const workerId = asText(row.worker_id);
      return workerId ? allowedWorkerIds.has(workerId) : false;
    })
    .map((row) =>
      mapProfileNotificationToAlert(row, workersById.get(asText(row.worker_id) ?? "") )
    );
}

export async function markWorkerProfileAlertReviewed(
  admin: SupabaseClient,
  alertId: string
): Promise<{ error: string | null }> {
  const trimmed = alertId.trim();
  if (!trimmed) return { error: "Alert id is required." };

  let payload: Record<string, unknown> = {
    read: true,
    is_read: true,
  };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { error } = await admin
      .from("notifications")
      .update(payload)
      .eq("id", trimmed)
      .eq("type", WORKER_PROFILE_ALERT_TYPE);
    if (!error) return { error: null };

    if (isSupabaseMissingColumnError(error)) {
      const parsed = parseMissingColumnFromError(error.message);
      if (parsed && parsed in payload) {
        payload = stripMissingColumn(payload, parsed);
        continue;
      }
    }
    if (isSupabaseRelationMissingError(error) || isSupabaseSchemaCacheError(error)) {
      return { error: "Alerts table is not available." };
    }
    return { error: error.message };
  }

  return { error: "Failed to mark alert as reviewed." };
}
