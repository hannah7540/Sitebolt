if (!process.env.NEXT_PUBLIC_SUPABASE_URL) process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://placeholder.supabase.co';
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'placeholder';
if (!process.env.SUPABASE_URL) process.env.SUPABASE_URL = 'https://placeholder.supabase.co';
if (!process.env.SUPABASE_ANON_KEY) process.env.SUPABASE_ANON_KEY = 'placeholder';
import type { SupabaseClient } from "@supabase/supabase-js";
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
import { hydrateCardsVocsFromWorker, cardCategoryRequiresExpiry } from "./worker-cards-vocs";
import { daysUntil, getWorkerDisplayName, WARNING_DAYS } from "./worker-utils";
import { normalizeSecurityRole } from "./security-roles";
import { fetchExpiryAlertSettings } from "./expiry-alert-settings";
import { sendEmail } from "./email-service";
import {
  buildComplianceAlertDigestEmail,
  buildInsuranceExpiryDigestEmail,
  buildWorkerDirectNotifyEmail,
  buildWorkerExpiryDigestEmail,
} from "./expiry-alert-email";
import {
  COMPLIANCE_ALERT_FILTER_OPTIONS,
  fetchComplianceAlerts,
  type ComplianceAlertFilter,
  type ComplianceAlertItem,
} from "./compliance-alerts-hub";
import { isSupabaseAdminConfigured } from "./supabase/env";
import { createSupabaseAdminClient } from "./supabase/admin";

export type ExpiryEntityType =
  | "worker_qualification"
  | "company_insurance"
  | "compliance_alert"
  | "heavy_vehicle_check"
  | "fleet_registration"
  | "plant_registration"
  | "worker_ticket";

export type ExpiryAlertKind =
  | "worker_digest"
  | "insurance_digest"
  | "manual_worker_notify"
  | "compliance_digest"
  | "compliance_item";

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
  complianceItemsIncluded: number;
  emailsAttempted: number;
  emailsSent: number;
  errors: string[];
  thresholds?: Record<string, number | string>;
}

const DEDUPE_WINDOW_DAYS = 7;

/** Published thresholds for Organisation -> Alerts (days before due/expiry). */
export const ORGANISATION_ALERT_THRESHOLDS = {
  heavy_vehicle_check_days: 56,
  fleet_plant_registration_days: 14,
  worker_ticket_license_voc_days: 30,
  company_insurance_days: 30,
  email_dedupe_window_days: DEDUPE_WINDOW_DAYS,
  service_due_hours:
    "Not configured as a day-based Organisation Alert (tracked via plant hours/pre-starts).",
} as const;

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
      if (!cardCategoryRequiresExpiry(entry.category)) continue;
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
        insurer: row.provider ?? row.insurer ?? null,
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
  const settings = await fetchExpiryAlertSettings();

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
    const secondary = settings.secondary_recipient_emails ?? [];
    return [...new Set([...designatedEmails, ...secondary])];
  }

  const adminEmails = workers
    .filter((worker) => {
      const role = normalizeSecurityRole(worker.security_role);
      return (
        (role === "full_access" ||
          role === "project_super_admin" ||
          role === "super_admin" ||
          role === "owner") &&
        isActiveWorker(worker) &&
        Boolean(worker.email?.trim())
      );
    })
    .map((worker) => worker.email.trim());

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

function mapAlertEntityType(alert: ComplianceAlertItem): ExpiryEntityType {
  switch (alert.category) {
    case "heavy_vehicle_check":
      return "heavy_vehicle_check";
    case "fleet_registration":
      return "fleet_registration";
    case "plant_registration":
      return "plant_registration";
    case "worker_ticket":
      return "worker_ticket";
    case "company_insurance":
      return "company_insurance";
    default:
      return "compliance_alert";
  }
}

function digestLabelForFilter(filterId: Exclude<ComplianceAlertFilter, "all">): string {
  return (
    COMPLIANCE_ALERT_FILTER_OPTIONS.find((option) => option.id === filterId)?.label ??
    "Compliance Alerts"
  );
}

function groupAlertsByFilter(
  alerts: ComplianceAlertItem[]
): Map<Exclude<ComplianceAlertFilter, "all">, ComplianceAlertItem[]> {
  const map = new Map<Exclude<ComplianceAlertFilter, "all">, ComplianceAlertItem[]>();
  for (const alert of alerts) {
    const list = map.get(alert.filterGroup) ?? [];
    list.push(alert);
    map.set(alert.filterGroup, list);
  }
  return map;
}

async function safeSendEmail(input: {
  to: string[];
  subject: string;
  html: string;
  text: string;
}): Promise<{ sent: boolean; error?: string }> {
  try {
    const result = await sendEmail(input);
    return { sent: result.sent, error: result.error };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Email dispatch failed.";
    console.error("[expiry-alerts] sendEmail threw:", cause);
    return { sent: false, error: message };
  }
}

export async function runExpiryAlertCheck(options?: {
  force?: boolean;
  admin?: SupabaseClient;
}): Promise<ExpiryAlertRunResult> {
  const thresholds = { ...ORGANISATION_ALERT_THRESHOLDS };

  try {
    const settings = await fetchExpiryAlertSettings();
    if (!settings.automated_emails_enabled && !options?.force) {
      return {
        skipped: true,
        reason: "Automated expiry emails are disabled.",
        workerItemsIncluded: 0,
        insuranceItemsIncluded: 0,
        complianceItemsIncluded: 0,
        emailsAttempted: 0,
        emailsSent: 0,
        errors: [],
        thresholds,
      };
    }

    const admin =
      options?.admin ??
      (isSupabaseAdminConfigured() ? createSupabaseAdminClient() : undefined);

    const [workers, compliance] = await Promise.all([
      fetchWorkers(),
      fetchComplianceAlerts({ admin }),
    ]);

    const recipients = await fetchExpiryAlertRecipients(workers);
    const errors: string[] = [];
    let emailsAttempted = 0;
    let emailsSent = 0;

    if (recipients.length === 0) {
      return {
        skipped: true,
        reason: "No admin or secondary recipient emails configured.",
        workerItemsIncluded: 0,
        insuranceItemsIncluded: 0,
        complianceItemsIncluded: compliance.alerts.length,
        emailsAttempted: 0,
        emailsSent: 0,
        errors: ["No recipients found."],
        thresholds,
      };
    }

    const allKeys = compliance.alerts.map((alert) => alert.id);
    const recentlyAlerted = await fetchRecentlyAlertedEntityKeys(allKeys);
    const pendingAlerts = compliance.alerts.filter(
      (alert) => !recentlyAlerted.has(alert.id)
    );

    const grouped = groupAlertsByFilter(pendingAlerts);

    for (const [filterId, alerts] of grouped.entries()) {
      if (alerts.length === 0) continue;

      emailsAttempted += 1;
      const email = buildComplianceAlertDigestEmail(
        digestLabelForFilter(filterId),
        alerts
      );
      const result = await safeSendEmail({
        to: recipients,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });

      if (result.sent) {
        emailsSent += 1;
        await logExpiryAlerts(
          alerts.flatMap((alert) =>
            recipients.map((recipientEmail) => ({
              entityType: mapAlertEntityType(alert),
              entityId: alert.sourceId,
              entityKey: alert.id,
              alertKind: "compliance_digest" as const,
              recipientEmail,
            }))
          )
        );
      } else if (result.error) {
        errors.push(`${filterId}: ${result.error}`);
      }
    }

    const workerCount = pendingAlerts.filter((a) => a.filterGroup === "worker_ticket").length;
    const insuranceCount = pendingAlerts.filter(
      (a) => a.filterGroup === "company_insurance"
    ).length;

    return {
      skipped: false,
      workerItemsIncluded: workerCount,
      insuranceItemsIncluded: insuranceCount,
      complianceItemsIncluded: pendingAlerts.length,
      emailsAttempted,
      emailsSent,
      errors,
      thresholds,
    };
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Expiry alert check failed unexpectedly.";
    console.error("[expiry-alerts] runExpiryAlertCheck failed:", cause);
    return {
      skipped: true,
      reason: message,
      workerItemsIncluded: 0,
      insuranceItemsIncluded: 0,
      complianceItemsIncluded: 0,
      emailsAttempted: 0,
      emailsSent: 0,
      errors: [message],
      thresholds,
    };
  }
}

export async function notifyWorkerAboutExpiries(
  workerId: string
): Promise<{ error: string | null; sent: boolean; itemCount: number }> {
  try {
    const summary = await fetchUpcomingExpiries();
    const items = summary.workerQualifications.filter((item) => item.workerId === workerId);

    if (items.length === 0) {
      return { error: "No upcoming expiries for this worker.", sent: false, itemCount: 0 };
    }

    const workerEmail = items[0]?.workerEmail?.trim();
    if (!workerEmail) {
      return {
        error: "Worker does not have an email address on file.",
        sent: false,
        itemCount: 0,
      };
    }

    const email = buildWorkerDirectNotifyEmail(items);
    const result = await safeSendEmail({
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
  } catch (cause) {
    console.error("[expiry-alerts] notifyWorkerAboutExpiries failed:", cause);
    return {
      error: cause instanceof Error ? cause.message : "Failed to notify worker.",
      sent: false,
      itemCount: 0,
    };
  }
}

export {
  WARNING_DAYS as EXPIRY_ALERT_WINDOW_DAYS,
  DEDUPE_WINDOW_DAYS,
  buildWorkerExpiryDigestEmail,
  buildInsuranceExpiryDigestEmail,
};
