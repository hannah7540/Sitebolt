import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sendComplianceReminders,
  stampDriversLicenceRemindedAt,
  stampLastRemindedAt,
  type ComplianceReminderKind,
} from "@/lib/compliance-reminders";
const HIRED_LABOUR_CATEGORY = "hired_labour";

const REMINDER_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const EXPIRY_LEAD_DAYS = 30;
const SYDNEY_TZ = "Australia/Sydney";

export type CronReminderRunResult = {
  swmsReminded: number;
  inductionReminded: number;
  vocReminded: number;
  licenceReminded: number;
  emailed: number;
  sms: number;
  notified: number;
  errors: string[];
};

type PendingAssignmentRow = {
  id: string;
  documentId: string;
  workerId: string;
  lastRemindedAt: string | null;
  assignedAt: string | null;
  title: string;
};

function sydneyTodayIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SYDNEY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function addDaysIso(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysUntilIso(expiryIso: string, todayIso: string): number {
  const expiry = Date.parse(`${expiryIso.slice(0, 10)}T00:00:00Z`);
  const today = Date.parse(`${todayIso}T00:00:00Z`);
  return Math.round((expiry - today) / 86400000);
}

function isPastInterval(timestamp: string | null | undefined, cutoffIso: string): boolean {
  if (!timestamp) return true;
  return timestamp <= cutoffIso;
}

function assignmentDue(
  row: { lastRemindedAt: string | null; assignedAt: string | null },
  cutoffIso: string
): boolean {
  if (row.lastRemindedAt) return row.lastRemindedAt <= cutoffIso;
  return Boolean(row.assignedAt && row.assignedAt <= cutoffIso);
}

function isHiredLabour(row: { worker_category?: string | null }): boolean {
  return String(row.worker_category ?? "").trim().toLowerCase() === HIRED_LABOUR_CATEGORY;
}

function isInactiveWorker(row: {
  is_revoked?: boolean | null;
  is_archived?: boolean | null;
  status?: string | null;
}): boolean {
  if (row.is_revoked || row.is_archived) return true;
  const status = String(row.status ?? "").trim().toLowerCase();
  return status === "revoked" || status === "deleted";
}

function asRecord(row: unknown): Record<string, unknown> {
  return row && typeof row === "object" ? (row as Record<string, unknown>) : {};
}

type FilterableQuery = {
  eq: (column: string, value: string) => FilterableQuery;
  neq: (column: string, value: string) => FilterableQuery;
  not: (column: string, operator: string, value: null) => FilterableQuery;
  lte: (column: string, value: string) => FilterableQuery;
  then?: unknown;
};

async function selectWithColumnFallback(
  admin: SupabaseClient,
  table: string,
  attempts: string[],
  apply?: (query: FilterableQuery) => FilterableQuery
) {
  const run = async (columns: string) => {
    const base = admin.from(table).select(columns) as unknown as FilterableQuery;
    const query = apply ? apply(base) : base;
    return await (query as unknown as PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>);
  };

  let result = await run(attempts[0]);
  for (let i = 1; i < attempts.length && result.error; i += 1) {
    const message = result.error.message.toLowerCase();
    if (
      !message.includes("column") &&
      !message.includes("schema cache") &&
      !message.includes("could not find")
    ) {
      break;
    }
    result = await run(attempts[i]);
  }
  return result;
}

async function loadWorkerMap(
  admin: SupabaseClient,
  workerIds: string[]
): Promise<Map<string, Record<string, unknown>>> {
  const unique = [...new Set(workerIds.filter(Boolean))];
  const map = new Map<string, Record<string, unknown>>();
  if (unique.length === 0) return map;

  const attempts = [
    "id, worker_category, is_revoked, is_archived, status",
    "id, worker_category, status",
    "id, worker_category",
    "id",
  ];

  let lookup = await admin.from("workers").select(attempts[0]).in("id", unique);
  for (let i = 1; i < attempts.length && lookup.error; i += 1) {
    lookup = await admin.from("workers").select(attempts[i]).in("id", unique);
  }
  if (lookup.error) {
    console.warn("[compliance-cron] worker lookup failed:", lookup.error.message);
    return map;
  }
  for (const row of lookup.data ?? []) {
    const rec = asRecord(row);
    const id = String(rec.id ?? "").trim();
    if (id) map.set(id, rec);
  }
  return map;
}

async function loadSwmsTitles(
  admin: SupabaseClient,
  ids: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return map;
  const { data, error } = await admin.from("swms_documents").select("id, title").in("id", unique);
  if (error) {
    console.warn("[compliance-cron] SWMS title lookup failed:", error.message);
    return map;
  }
  for (const row of data ?? []) {
    const rec = asRecord(row);
    map.set(String(rec.id ?? ""), String(rec.title ?? "SWMS"));
  }
  return map;
}

async function loadInductionTitles(
  admin: SupabaseClient,
  ids: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return map;
  const { data, error } = await admin
    .from("induction_form_templates")
    .select("id, title")
    .in("id", unique);
  if (error) {
    console.warn("[compliance-cron] induction title lookup failed:", error.message);
    return map;
  }
  for (const row of data ?? []) {
    const rec = asRecord(row);
    map.set(String(rec.id ?? ""), String(rec.title ?? "Induction"));
  }
  return map;
}

async function dispatchGrouped(
  admin: SupabaseClient,
  kind: ComplianceReminderKind,
  rows: PendingAssignmentRow[],
  stampTable: "swms_assignments" | "form_worker_assignments"
): Promise<{ count: number; emailed: number; sms: number; notified: number; errors: string[] }> {
  const groups = new Map<string, { title: string; workerIds: string[]; rowIds: string[] }>();
  for (const row of rows) {
    const existing = groups.get(row.documentId);
    if (existing) {
      if (!existing.workerIds.includes(row.workerId)) existing.workerIds.push(row.workerId);
      existing.rowIds.push(row.id);
    } else {
      groups.set(row.documentId, {
        title: row.title,
        workerIds: [row.workerId],
        rowIds: [row.id],
      });
    }
  }

  let count = 0;
  let emailed = 0;
  let sms = 0;
  let notified = 0;
  const errors: string[] = [];

  for (const [documentId, group] of groups) {
    const result = await sendComplianceReminders(admin, {
      kind,
      mode: "reminder",
      workerIds: group.workerIds,
      documentTitle: group.title,
      documentId,
    });
    emailed += result.emailed;
    sms += result.sms;
    notified += result.notified;
    errors.push(...result.errors);
    if (result.emailed + result.sms + result.notified > 0) {
      count += group.workerIds.length;
      await stampLastRemindedAt(admin, stampTable, group.rowIds);
    }
  }

  return { count, emailed, sms, notified, errors };
}

async function collectDueSwms(
  admin: SupabaseClient,
  cutoffIso: string
): Promise<PendingAssignmentRow[]> {
  const result = await selectWithColumnFallback(
    admin,
    "swms_assignments",
    [
      "id, swms_id, assignee_id, worker_id, assignee_type, status, last_reminded_at, created_at, assigned_at",
      "id, swms_id, assignee_id, worker_id, assignee_type, status, last_reminded_at, created_at",
      "id, swms_id, assignee_id, worker_id, assignee_type, status, created_at",
      "id, swms_id, assignee_id, assignee_type, status, created_at",
    ],
    (query) => query.eq("status", "Pending")
  );
  if (result.error) {
    console.warn("[compliance-cron] swms_assignments query failed:", result.error.message);
    return [];
  }

  const pending: PendingAssignmentRow[] = [];
  for (const raw of result.data ?? []) {
    const row = asRecord(raw);
    const status = String(row.status ?? "");
    if (status !== "Pending") continue;
    if (String(row.assignee_type ?? "worker") === "subcontractor") continue;
    const workerId = String(row.worker_id ?? row.assignee_id ?? "").trim();
    if (!workerId) continue;
    const mapped = {
      id: String(row.id ?? ""),
      documentId: String(row.swms_id ?? ""),
      workerId,
      lastRemindedAt: row.last_reminded_at ? String(row.last_reminded_at) : null,
      assignedAt: row.created_at
        ? String(row.created_at)
        : row.assigned_at
          ? String(row.assigned_at)
          : null,
      title: "SWMS",
    };
    if (!mapped.id || !mapped.documentId) continue;
    if (assignmentDue(mapped, cutoffIso)) pending.push(mapped);
  }

  const workers = await loadWorkerMap(
    admin,
    pending.map((row) => row.workerId)
  );
  const eligible = pending.filter((row) => {
    const worker = workers.get(row.workerId);
    if (!worker) return true;
    return !isInactiveWorker(worker);
  });

  const titles = await loadSwmsTitles(
    admin,
    eligible.map((row) => row.documentId)
  );
  return eligible.map((row) => ({
    ...row,
    title: titles.get(row.documentId) ?? "SWMS",
  }));
}

async function collectDueInductions(
  admin: SupabaseClient,
  cutoffIso: string
): Promise<PendingAssignmentRow[]> {
  const result = await selectWithColumnFallback(
    admin,
    "form_worker_assignments",
    [
      "id, form_id, worker_id, status, last_reminded_at, assigned_at, created_at, form_title",
      "id, form_id, worker_id, status, last_reminded_at, assigned_at, form_title",
      "id, form_id, worker_id, status, assigned_at, form_title",
      "id, form_id, worker_id, status, assigned_at, created_at",
      "id, form_id, worker_id, status, assigned_at",
    ],
    (query) => query.neq("status", "completed")
  );
  if (result.error) {
    console.warn(
      "[compliance-cron] form_worker_assignments query failed:",
      result.error.message
    );
    return [];
  }

  const pending: PendingAssignmentRow[] = [];
  for (const raw of result.data ?? []) {
    const row = asRecord(raw);
    const status = String(row.status ?? "").toLowerCase();
    if (status === "completed") continue;
    const workerId = String(row.worker_id ?? "").trim();
    const mapped = {
      id: String(row.id ?? ""),
      documentId: String(row.form_id ?? ""),
      workerId,
      lastRemindedAt: row.last_reminded_at ? String(row.last_reminded_at) : null,
      assignedAt: row.assigned_at
        ? String(row.assigned_at)
        : row.created_at
          ? String(row.created_at)
          : null,
      title: String(row.form_title ?? "Induction"),
    };
    if (!mapped.id || !mapped.documentId || !workerId) continue;
    if (assignmentDue(mapped, cutoffIso)) pending.push(mapped);
  }

  const workers = await loadWorkerMap(
    admin,
    pending.map((row) => row.workerId)
  );
  const eligible = pending.filter((row) => {
    const worker = workers.get(row.workerId);
    if (!worker) return true;
    return !isInactiveWorker(worker);
  });

  const titles = await loadInductionTitles(
    admin,
    eligible.map((row) => row.documentId)
  );
  return eligible.map((row) => ({
    ...row,
    title: titles.get(row.documentId) ?? row.title,
  }));
}

export async function runDailyComplianceReminders(
  admin: SupabaseClient,
  now = new Date()
): Promise<CronReminderRunResult> {
  const cutoffIso = new Date(now.getTime() - REMINDER_INTERVAL_MS).toISOString();
  const todayIso = sydneyTodayIso(now);
  const windowEnd = addDaysIso(todayIso, EXPIRY_LEAD_DAYS);

  const errors: string[] = [];
  let emailed = 0;
  let sms = 0;
  let notified = 0;

  const swmsDue = await collectDueSwms(admin, cutoffIso);
  const swmsResult = await dispatchGrouped(admin, "swms", swmsDue, "swms_assignments");
  emailed += swmsResult.emailed;
  sms += swmsResult.sms;
  notified += swmsResult.notified;
  errors.push(...swmsResult.errors);

  const inductionDue = await collectDueInductions(admin, cutoffIso);
  const inductionResult = await dispatchGrouped(
    admin,
    "induction",
    inductionDue,
    "form_worker_assignments"
  );
  emailed += inductionResult.emailed;
  sms += inductionResult.sms;
  notified += inductionResult.notified;
  errors.push(...inductionResult.errors);

  let vocReminded = 0;
  const vocLookup = await selectWithColumnFallback(
    admin,
    "worker_vocs",
    [
      "id, worker_id, title, voc_type, expiry_date, last_reminded_at",
      "id, worker_id, title, expiry_date, last_reminded_at",
      "id, worker_id, title, expiry_date",
    ],
    (query) => query.not("expiry_date", "is", null).lte("expiry_date", windowEnd)
  );
  if (vocLookup.error) {
    errors.push(`worker_vocs: ${vocLookup.error.message}`);
  } else {
    const vocRows = (vocLookup.data ?? [])
      .map((raw) => asRecord(raw))
      .filter((row) => {
        const expiry = String(row.expiry_date ?? "").slice(0, 10);
        if (!expiry) return false;
        return expiry <= windowEnd;
      });
    const workerMap = await loadWorkerMap(
      admin,
      vocRows.map((row) => String(row.worker_id ?? ""))
    );

    for (const row of vocRows) {
      const workerId = String(row.worker_id ?? "").trim();
      const worker = workerMap.get(workerId);
      if (!workerId || !worker) continue;
      if (isHiredLabour(worker) || isInactiveWorker(worker)) continue;
      const expiry = String(row.expiry_date ?? "").slice(0, 10);
      const daysRemaining = daysUntilIso(expiry, todayIso);
      if (daysRemaining > EXPIRY_LEAD_DAYS) continue;
      const lastReminded = row.last_reminded_at ? String(row.last_reminded_at) : null;
      if (!isPastInterval(lastReminded, cutoffIso)) continue;

      const title =
        String(row.title ?? "").trim() ||
        String(row.voc_type ?? "").trim() ||
        "VOC";
      const result = await sendComplianceReminders(admin, {
        kind: "voc",
        mode: "expiry",
        workerIds: [workerId],
        documentTitle: title,
        documentId: String(row.id ?? ""),
        daysRemaining,
        expiryDate: expiry,
      });
      emailed += result.emailed;
      sms += result.sms;
      notified += result.notified;
      errors.push(...result.errors);
      if (result.emailed + result.sms + result.notified > 0) {
        vocReminded += 1;
        await stampLastRemindedAt(admin, "worker_vocs", [String(row.id ?? "")]);
      }
    }
  }

  let licenceReminded = 0;
  const licenceLookup = await selectWithColumnFallback(
    admin,
    "workers",
    [
      "id, worker_category, is_revoked, is_archived, status, drivers_licence_expiry, drivers_licence_last_reminded_at",
      "id, worker_category, status, drivers_licence_expiry, drivers_licence_last_reminded_at",
      "id, worker_category, drivers_licence_expiry",
      "id, drivers_licence_expiry",
    ],
    (query) =>
      query.not("drivers_licence_expiry", "is", null).lte("drivers_licence_expiry", windowEnd)
  );
  if (licenceLookup.error) {
    errors.push(`workers licence: ${licenceLookup.error.message}`);
  } else {
    for (const raw of licenceLookup.data ?? []) {
      const row = asRecord(raw);
      if (isHiredLabour(row) || isInactiveWorker(row)) continue;
      const expiry = String(row.drivers_licence_expiry ?? "").slice(0, 10);
      if (!expiry || expiry > windowEnd) continue;
      const daysRemaining = daysUntilIso(expiry, todayIso);
      if (daysRemaining > EXPIRY_LEAD_DAYS) continue;
      const lastReminded = row.drivers_licence_last_reminded_at
        ? String(row.drivers_licence_last_reminded_at)
        : null;
      if (!isPastInterval(lastReminded, cutoffIso)) continue;
      const workerId = String(row.id ?? "").trim();
      if (!workerId) continue;

      const result = await sendComplianceReminders(admin, {
        kind: "licence",
        mode: "expiry",
        workerIds: [workerId],
        documentTitle: "Driver's licence",
        documentId: workerId,
        daysRemaining,
        expiryDate: expiry,
      });
      emailed += result.emailed;
      sms += result.sms;
      notified += result.notified;
      errors.push(...result.errors);
      if (result.emailed + result.sms + result.notified > 0) {
        licenceReminded += 1;
        await stampDriversLicenceRemindedAt(admin, [workerId]);
      }
    }
  }

  return {
    swmsReminded: swmsResult.count,
    inductionReminded: inductionResult.count,
    vocReminded,
    licenceReminded,
    emailed,
    sms,
    notified,
    errors,
  };
}
