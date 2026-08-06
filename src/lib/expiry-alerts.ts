if (!process.env.NEXT_PUBLIC_SUPABASE_URL) process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://placeholder.supabase.co';
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'placeholder';
if (!process.env.SUPABASE_URL) process.env.SUPABASE_URL = 'https://placeholder.supabase.co';
if (!process.env.SUPABASE_ANON_KEY) process.env.SUPABASE_ANON_KEY = 'placeholder';
import {
  fetchAllWorkerVocs,
  fetchCompanyInsurances,
  fetchWorkers,
  isSupabaseConfigured,
  supabase,
  type CompanyInsurance,
  type Worker,
  type WorkerVoc,
} from "./supabase";
import { hydrateCardsVocsFromWorker } from "./worker-cards-vocs";
import { daysUntil, getWorkerDisplayName, WARNING_DAYS } from "./worker-utils";
import { normalizeSecurityRole } from "./security-roles";
import { fetchExpiryAlertSettings } from "./expiry-alert-settings";
import { sendEmail } from "./email-service";
import {
  buildInsuranceExpiryDigestEmail,
  buildWorkerExpiryDigestEmail,
  buildWorkerDirectNotifyEmail,
} from "./expiry-alert-email";

export type ExpiryEntityType = "worker_qualification" | "company_insurance";
export type ExpiryAlertKind = "worker_digest" | "insurance_digest" | "manual_worker_notify";

export interface UpcomingWorkerQualificationExpiry {
  entityType: "worker_qualification";
  entityId: string;
  entityKey: string;
  workerId: string;
  workerName: string;
  workerEmail: string | null;
  documentType: string;
  expiryDate: string;
  daysRemaining: number;
}

export interface UpcomingInsuranceExpiry {
  entityType: "company_insurance";
  entityId: string;
  entityKey: string;
  policyName: string;
  policyNumber: string | null;
  insurer: string | null;
  expiryDate: string;
  daysRemaining: number;
}

export type UpcomingExpiryItem =
  | UpcomingWorkerQualificationExpiry
  | UpcomingInsuranceExpiry;

export interface ExpiryCheckSummary {
  workerQualifications: UpcomingWorkerQualificationExpiry[];
  insurances: UpcomingInsuranceExpiry[];
  adminRecipients: string[];
}

export interface ExpiryAlertRunResult {
  skipped: boolean;
  reason?: string;
  workerItemsIncluded: number;
  insuranceItemsIncluded: number;
  emailsAttempted: number;
  emailsSent: number;
  errors: string[];
}

const DEDUPE_WINDOW_DAYS = 7;

function isMissingTableError(message: string, table: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes(table.toLowerCase()) &&
    (lower.includes("does not exist") ||
      lower.includes("could not find") ||
      lower.includes("schema cache"))
  );
}

function isActiveWorker(worker: Worker): boolean {
  if (worker.is_revoked || worker.is_archived) return false;
  return worker.status !== "pending_induction";
}

export function isWithinExpiryAlertWindow(
  expiryDate: string | null | undefined
): boolean {
  const days = daysUntil(expiryDate);
  if (days === null) return false;
  return days >= 0 && days <= WARNING_DAYS;
}

function buildWorkerQualificationEntityKey(
  workerId: string,
  entryId: string,
  expiryDate: string
): string {
  return `worker:${workerId}:qual:${entryId}:${expiryDate.slice(0, 10)}`;
}

function buildInsuranceEntityKey(insuranceId: string, expiryDate: string): string {
  return `insurance:${insuranceId}:${expiryDate.slice(0, 10)}`;
}

export function collectWorkerQualificationExpiries(
  workers: Worker[],
  vocsByWorker: Map<string, WorkerVoc[]>
): UpcomingWorkerQualificationExpiry[] {
  const results: UpcomingWorkerQualificationExpiry[] = [];

  for (const worker of workers) {
    if (!isActiveWorker(worker)) continue;

    const entries = hydrateCardsVocsFromWorker(
      worker,
      vocsByWorker.get(worker.id) ?? []
    );

    for (const entry of entries) {
      if (!isWithinExpiryAlertWindow(entry.expiry_date)) continue;

      const daysRemaining = daysUntil(entry.expiry_date)!;
      results.push({
        entityType: "worker_qualification",
        entityId: entry.id,
        entityKey: buildWorkerQualificationEntityKey(
          worker.id,
          entry.id,
          entry.expiry_date!
        ),
        workerId: worker.id,
        workerName: getWorkerDisplayName(worker),
        workerEmail: worker.email?.trim() || null,
        documentType: entry.ticket_name,
        expiryDate: entry.expiry_date!.slice(0, 10),
        daysRemaining,
      });
    }
  }

  return results.sort((left, right) => left.daysRemaining - right.daysRemaining);
}

export function collectInsuranceExpiries(
  insurances: CompanyInsurance[]
): UpcomingInsuranceExpiry[] {
  return insurances
    .filter((row) => isWithinExpiryAlertWindow(row.expiry_date))
    .map((row) => {
      const expiryDate = row.expiry_date!.slice(0, 10);
      return {
        entityType: "company_insurance" as const,
        entityId: row.id,
        entityKey: buildInsuranceEntityKey(row.id, expiryDate),
        policyName: row.insurance_type,
        policyNumber: row.policy_number,
        insurer: row.insurer ?? null,
        expiryDate,
        daysRemaining: daysUntil(row.expiry_date)!,
      };
    })
    .sort((left, right) => left.daysRemaining - right.daysRemaining);
}

export async function fetchUpcomingExpiries(): Promise<ExpiryCheckSummary> {
  const [workers, vocs, insurances] = await Promise.all([
    fetchWorkers(),
    fetchAllWorkerVocs(),
    fetchCompanyInsurances(),
  ]);

  const vocsByWorker = new Map<string, WorkerVoc[]>();
  for (const voc of vocs) {
    const list = vocsByWorker.get(voc.worker_id) ?? [];
    list.push(voc);
    vocsByWorker.set(voc.worker_id, list);
  }

  const workerQualifications = collectWorkerQualificationExpiries(workers, vocsByWorker);
  const insuranceItems = collectInsuranceExpiries(insurances);
  const adminRecipients = await fetchExpiryAlertRecipients(workers);

  return {
    workerQualifications,
    insurances: insuranceItems,
    adminRecipients,
  };
}

export async function fetchExpiryAlertRecipients(workers: Worker[]): Promise<string[]> {
  const adminEmails = workers
    .filter((worker) => {
      const role = normalizeSecurityRole(worker.security_role);
      return (
        (role === "full_access" || role === "admin_access") &&
        isActiveWorker(worker) &&
        Boolean(worker.email?.trim())
      );
    })
    .map((worker) => worker.email.trim());

  const settings = await fetchExpiryAlertSettings();
  const secondary = settings.secondary_recipient_emails ?? [];

  return [...new Set([...adminEmails, ...secondary])];
}

export async function fetchRecentlyAlertedEntityKeys(
  entityKeys: string[],
  withinDays = DEDUPE_WINDOW_DAYS
): Promise<Set<string>> {
  const result = new Set<string>();
  if (!isSupabaseConfigured() || entityKeys.length === 0) return result;

  const since = new Date();
  since.setDate(since.getDate() - withinDays);
  const sinceIso = since.toISOString();

  const { data, error } = await supabase
    .from("expiry_alert_logs")
    .select("entity_key")
    .in("entity_key", entityKeys)
    .gte("sent_at", sinceIso);

  if (error) {
    if (!isMissingTableError(error.message, "expiry_alert_logs")) {
      console.warn("fetchRecentlyAlertedEntityKeys failed:", error.message);
    }
    return result;
  }

  for (const row of data ?? []) {
    result.add(String((row as { entity_key: string }).entity_key));
  }

  return result;
}

export async function logExpiryAlerts(
  entries: Array<{
    entityType: ExpiryEntityType;
    entityId: string;
    entityKey: string;
    alertKind: ExpiryAlertKind;
    recipientEmail: string;
  }>
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured() || entries.length === 0) return { error: null };

  const rows = entries.map((entry) => ({
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    entity_key: entry.entityKey,
    alert_kind: entry.alertKind,
    recipient_email: entry.recipientEmail,
    sent_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("expiry_alert_logs").insert(rows);

  if (error && !isMissingTableError(error.message, "expiry_alert_logs")) {
    return { error: error.message };
  }

  return { error: null };
}

function buildLogEntriesForDigest<T extends UpcomingExpiryItem>(
  items: T[],
  recipients: string[],
  alertKind: ExpiryAlertKind
): Array<{
  entityType: ExpiryEntityType;
  entityId: string;
  entityKey: string;
  alertKind: ExpiryAlertKind;
  recipientEmail: string;
}> {
  const logs: Array<{
    entityType: ExpiryEntityType;
    entityId: string;
    entityKey: string;
    alertKind: ExpiryAlertKind;
    recipientEmail: string;
  }> = [];

  for (const item of items) {
    for (const recipient of recipients) {
      logs.push({
        entityType: item.entityType,
        entityId: item.entityId,
        entityKey: item.entityKey,
        alertKind,
        recipientEmail: recipient,
      });
    }
  }

  return logs;
}

export async function runExpiryAlertCheck(options?: {
  force?: boolean;
}): Promise<ExpiryAlertRunResult> {
  const settings = await fetchExpiryAlertSettings();
  if (!settings.automated_emails_enabled && !options?.force) {
    return {
      skipped: true,
      reason: "Automated expiry emails are disabled.",
      workerItemsIncluded: 0,
      insuranceItemsIncluded: 0,
      emailsAttempted: 0,
      emailsSent: 0,
      errors: [],
    };
  }

  const summary = await fetchUpcomingExpiries();
  const allKeys = [
    ...summary.workerQualifications.map((item) => item.entityKey),
    ...summary.insurances.map((item) => item.entityKey),
  ];

  const recentlyAlerted = await fetchRecentlyAlertedEntityKeys(allKeys);

  const workerItems = summary.workerQualifications.filter(
    (item) => !recentlyAlerted.has(item.entityKey)
  );
  const insuranceItems = summary.insurances.filter(
    (item) => !recentlyAlerted.has(item.entityKey)
  );

  const recipients = summary.adminRecipients;
  const errors: string[] = [];
  let emailsAttempted = 0;
  let emailsSent = 0;

  if (recipients.length === 0) {
    return {
      skipped: true,
      reason: "No admin or secondary recipient emails configured.",
      workerItemsIncluded: workerItems.length,
      insuranceItemsIncluded: insuranceItems.length,
      emailsAttempted: 0,
      emailsSent: 0,
      errors: ["No recipients found."],
    };
  }

  if (workerItems.length > 0) {
    emailsAttempted += 1;
    const email = buildWorkerExpiryDigestEmail(workerItems);
    const result = await sendEmail({
      to: recipients,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });

    if (result.sent) {
      emailsSent += 1;
      await logExpiryAlerts(
        buildLogEntriesForDigest(workerItems, recipients, "worker_digest")
      );
    } else if (result.error) {
      errors.push(result.error);
    }
  }

  if (insuranceItems.length > 0) {
    emailsAttempted += 1;
    const email = buildInsuranceExpiryDigestEmail(insuranceItems);
    const result = await sendEmail({
      to: recipients,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });

    if (result.sent) {
      emailsSent += 1;
      await logExpiryAlerts(
        buildLogEntriesForDigest(insuranceItems, recipients, "insurance_digest")
      );
    } else if (result.error) {
      errors.push(result.error);
    }
  }

  return {
    skipped: false,
    workerItemsIncluded: workerItems.length,
    insuranceItemsIncluded: insuranceItems.length,
    emailsAttempted,
    emailsSent,
    errors,
  };
}

export async function notifyWorkerAboutExpiries(
  workerId: string
): Promise<{ error: string | null; sent: boolean; itemCount: number }> {
  const summary = await fetchUpcomingExpiries();
  const items = summary.workerQualifications.filter((item) => item.workerId === workerId);

  if (items.length === 0) {
    return { error: "No upcoming expiries for this worker.", sent: false, itemCount: 0 };
  }

  const workerEmail = items[0]?.workerEmail?.trim();
  if (!workerEmail) {
    return { error: "Worker does not have an email address on file.", sent: false, itemCount: 0 };
  }

  const email = buildWorkerDirectNotifyEmail(items);
  const result = await sendEmail({
    to: [workerEmail],
    subject: email.subject,
    html: email.html,
    text: email.text,
  });

  if (!result.sent) {
    return {
      error: result.error ?? "Failed to send notification email.",
      sent: false,
      itemCount: items.length,
    };
  }

  await logExpiryAlerts(
    items.map((item) => ({
      entityType: item.entityType,
      entityId: item.entityId,
      entityKey: item.entityKey,
      alertKind: "manual_worker_notify" as const,
      recipientEmail: workerEmail,
    }))
  );

  return { error: null, sent: true, itemCount: items.length };
}

export { WARNING_DAYS as EXPIRY_ALERT_WINDOW_DAYS, DEDUPE_WINDOW_DAYS };


