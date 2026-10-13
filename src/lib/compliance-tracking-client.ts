type ReminderGroupRow = {
  status: "Completed" | "Pending";
  canRemind: boolean;
  workerId: string;
  documentId: string;
  documentTitle: string;
};

export type ComplianceReminderApiResult = {
  ok: boolean;
  emailed: number;
  sms: number;
  notified: number;
  error: string | null;
};

function asCount(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function postComplianceReminders(input: {
  kind: "swms" | "induction";
  workerIds: string[];
  documentTitle: string;
  documentId?: string | null;
}): Promise<ComplianceReminderApiResult> {
  const workerIds = [...new Set(input.workerIds.map((id) => id.trim()).filter(Boolean))];
  if (workerIds.length === 0) {
    return {
      ok: false,
      emailed: 0,
      sms: 0,
      notified: 0,
      error: "No workers selected.",
    };
  }

  try {
    const response = await fetch("/api/admin/compliance/remind", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: input.kind,
        worker_ids: workerIds,
        document_title: input.documentTitle,
        document_id: input.documentId ?? null,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const emailed = asCount(payload.emailed);
    const sms = asCount(payload.sms);
    const notified = asCount(payload.notified);
    if (!response.ok) {
      return {
        ok: false,
        emailed,
        sms,
        notified,
        error: String(payload.error ?? "Could not send reminder."),
      };
    }
    return { ok: true, emailed, sms, notified, error: null };
  } catch (cause) {
    return {
      ok: false,
      emailed: 0,
      sms: 0,
      notified: 0,
      error: cause instanceof Error ? cause.message : "Could not send reminder.",
    };
  }
}

export async function postComplianceRemindersGrouped(
  kind: "swms" | "induction",
  rows: ReminderGroupRow[]
): Promise<ComplianceReminderApiResult> {
  const groups = new Map<
    string,
    { title: string; documentId: string | null; workerIds: string[] }
  >();
  for (const row of rows) {
    if (row.status !== "Pending" || !row.canRemind) continue;
    const workerId = row.workerId.trim();
    if (!workerId) continue;
    const key = row.documentId || `__title:${row.documentTitle}`;
    const existing = groups.get(key);
    if (existing) {
      if (!existing.workerIds.includes(workerId)) existing.workerIds.push(workerId);
    } else {
      groups.set(key, {
        title: row.documentTitle,
        documentId: row.documentId || null,
        workerIds: [workerId],
      });
    }
  }

  if (groups.size === 0) {
    return {
      ok: false,
      emailed: 0,
      sms: 0,
      notified: 0,
      error: "No pending workers to remind.",
    };
  }

  let emailed = 0;
  let sms = 0;
  let notified = 0;
  const errors: string[] = [];

  for (const group of groups.values()) {
    const result = await postComplianceReminders({
      kind,
      workerIds: group.workerIds,
      documentTitle: group.title,
      documentId: group.documentId,
    });
    emailed += result.emailed;
    sms += result.sms;
    notified += result.notified;
    if (result.error) errors.push(result.error);
  }

  const delivered = emailed + sms + notified;
  return {
    ok: delivered > 0,
    emailed,
    sms,
    notified,
    error: delivered > 0 ? null : errors[0] ?? "Could not send reminder.",
  };
}

export function formatComplianceReminderToast(result: ComplianceReminderApiResult): string {
  const parts: string[] = [];
  if (result.emailed) {
    parts.push(`${result.emailed} email${result.emailed === 1 ? "" : "s"}`);
  }
  if (result.sms) parts.push(`${result.sms} SMS`);
  if (result.notified) {
    parts.push(`${result.notified} in-app`);
  }
  if (parts.length === 0) return "Reminder sent.";
  return `Reminder sent (${parts.join(", ")}).`;
}
