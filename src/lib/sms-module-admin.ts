import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getSmsContactPhone,
  normalizePhoneNumber,
  phonesMatch,
  toE164Phone,
} from "@/lib/sms-phone";
import { getTwilioFromNumber, sendTwilioSms } from "@/lib/sms-service";
import type {
  ComposeSmsInput,
  SmsDispatchError,
  SmsFolder,
  SmsMessageRow,
  SmsThreadSummary,
} from "@/lib/sms-types";
import { getWorkerDisplayName } from "@/lib/worker-utils";

type AdminClient = SupabaseClient;

interface WorkerPhoneRow {
  id: string;
  phone: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  status?: string | null;
  is_revoked?: boolean | null;
  is_archived?: boolean | null;
  assigned_project_ids?: string[] | null;
  assigned_project_id?: string | null;
}

function mapSmsRow(row: Record<string, unknown>): SmsMessageRow {
  return {
    id: String(row.id ?? ""),
    direction: row.direction === "inbound" ? "inbound" : "outbound",
    from_number: String(row.from_number ?? ""),
    to_number: String(row.to_number ?? ""),
    message_body: String(row.message_body ?? ""),
    status: (String(row.status ?? "queued") as SmsMessageRow["status"]) || "queued",
    worker_id: row.worker_id ? String(row.worker_id) : null,
    project_id: row.project_id ? String(row.project_id) : null,
    is_read: Boolean(row.is_read),
    scheduled_at: row.scheduled_at ? String(row.scheduled_at) : null,
    recurrence: row.recurrence ? String(row.recurrence) : null,
    twilio_sid: row.twilio_sid ? String(row.twilio_sid) : null,
    error_message: row.error_message ? String(row.error_message) : null,
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: row.updated_at ? String(row.updated_at) : null,
  };
}

function isActiveWorker(worker: WorkerPhoneRow): boolean {
  return (
    !worker.is_revoked &&
    !worker.is_archived &&
    String(worker.status ?? "").toLowerCase() !== "revoked"
  );
}

async function loadWorkersWithPhones(
  admin: AdminClient
): Promise<WorkerPhoneRow[]> {
  const { data, error } = await admin
    .from("workers")
    .select(
      "id, phone, full_name, first_name, last_name, status, is_revoked, is_archived, assigned_project_ids, assigned_project_id"
    );

  if (error) {
    console.error("[sms] loadWorkersWithPhones:", error.message);
    return [];
  }

  return ((data ?? []) as WorkerPhoneRow[]).filter(
    (worker) => isActiveWorker(worker) && Boolean(toE164Phone(worker.phone))
  );
}

async function resolveRecipientWorkers(
  admin: AdminClient,
  input: ComposeSmsInput
): Promise<{ workers: WorkerPhoneRow[]; error: string | null }> {
  const all = await loadWorkersWithPhones(admin);

  if (input.target_mode === "all_workers") {
    return { workers: all, error: all.length ? null : "No workers with phone numbers found." };
  }

  if (input.target_mode === "selected_workers") {
    const ids = new Set((input.worker_ids ?? []).map((id) => id.trim()).filter(Boolean));
    const workers = all.filter((worker) => ids.has(worker.id));
    return {
      workers,
      error: workers.length ? null : "Select at least one worker with a phone number.",
    };
  }

  if (input.target_mode === "by_project") {
    const projectIds = new Set(
      (input.project_ids ?? []).map((id) => id.trim()).filter(Boolean)
    );
    if (projectIds.size === 0) {
      return { workers: [], error: "Select at least one project." };
    }

    const { data: assignments } = await admin
      .from("project_worker_assignments")
      .select("project_id, worker_id, status")
      .in("project_id", Array.from(projectIds));

    const assignedIds = new Set<string>();
    for (const row of assignments ?? []) {
      const status = String((row as { status?: string }).status ?? "");
      if (status.toLowerCase() === "transferred") continue;
      const workerId = String((row as { worker_id?: string }).worker_id ?? "");
      if (workerId) assignedIds.add(workerId);
    }

    const workers = all.filter((worker) => {
      if (assignedIds.has(worker.id)) return true;
      const ids = [
        ...(Array.isArray(worker.assigned_project_ids)
          ? worker.assigned_project_ids
          : []),
        worker.assigned_project_id,
      ]
        .map((id) => String(id ?? "").trim())
        .filter(Boolean);
      return ids.some((id) => projectIds.has(id));
    });

    return {
      workers,
      error: workers.length
        ? null
        : "No workers with phone numbers found for the selected project(s).",
    };
  }

  return { workers: [], error: "Invalid target mode." };
}

function findWorkerByPhone(
  workers: WorkerPhoneRow[],
  phone: string
): WorkerPhoneRow | null {
  return workers.find((worker) => phonesMatch(worker.phone, phone)) ?? null;
}

export async function fetchUnreadSmsCountAdmin(
  admin: AdminClient
): Promise<number> {
  const { count, error } = await admin
    .from("sms_messages")
    .select("id", { count: "exact", head: true })
    .eq("direction", "inbound")
    .eq("is_read", false);

  if (error) {
    console.error("[sms] unread count:", error.message);
    return 0;
  }
  return count ?? 0;
}

export async function fetchSmsMessagesAdmin(
  admin: AdminClient,
  folder: SmsFolder
): Promise<{ messages: SmsMessageRow[]; error: string | null }> {
  let query = admin
    .from("sms_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (folder === "sent") {
    query = query.eq("direction", "outbound");
  }

  const { data, error } = await query;
  if (error) {
    console.error("[sms] fetchSmsMessagesAdmin:", error.message, { folder });
    return { messages: [], error: error.message };
  }

  const workers = await loadWorkersWithPhones(admin);
  const byId = new Map(workers.map((worker) => [worker.id, worker]));

  const messages = ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const mapped = mapSmsRow(row);
    const worker =
      (mapped.worker_id ? byId.get(mapped.worker_id) : null) ??
      findWorkerByPhone(
        workers,
        mapped.direction === "inbound" ? mapped.from_number : mapped.to_number
      );
    return {
      ...mapped,
      worker_name: worker
        ? getWorkerDisplayName(worker)
        : null,
    };
  });

  return { messages, error: null };
}

export function buildSmsThreads(messages: SmsMessageRow[]): SmsThreadSummary[] {
  type ThreadAcc = SmsThreadSummary & { hasInbound: boolean };
  const byKey = new Map<string, ThreadAcc>();
  const workerToKey = new Map<string, string>();

  function resolveThreadKey(message: SmsMessageRow): string {
    const contactPhone = getSmsContactPhone(message);

    if (message.worker_id?.trim()) {
      const workerId = message.worker_id.trim();
      const mapped = workerToKey.get(workerId);
      if (mapped) return mapped;
      if (contactPhone) {
        workerToKey.set(workerId, contactPhone);
        return contactPhone;
      }
      const workerKey = `worker:${workerId}`;
      workerToKey.set(workerId, workerKey);
      return workerKey;
    }

    if (contactPhone) return contactPhone;
    return `msg:${message.id}`;
  }

  for (const message of messages) {
    const contactPhone = getSmsContactPhone(message);
    const key = resolveThreadKey(message);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, {
        threadKey: key,
        worker_id: message.worker_id,
        worker_name: message.worker_name ?? null,
        phone_number: contactPhone || message.from_number,
        last_message: message.message_body,
        last_at: message.created_at,
        unread_count:
          message.direction === "inbound" && !message.is_read ? 1 : 0,
        message_count: 1,
        hasInbound: message.direction === "inbound",
      });
      continue;
    }

    existing.message_count += 1;
    if (message.direction === "inbound") {
      existing.hasInbound = true;
      if (!message.is_read) existing.unread_count += 1;
    }
    if (
      new Date(message.created_at).getTime() > new Date(existing.last_at).getTime()
    ) {
      existing.last_message = message.message_body;
      existing.last_at = message.created_at;
    }
    if (message.worker_id) existing.worker_id = message.worker_id;
    if (message.worker_name) existing.worker_name = message.worker_name;
    if (contactPhone) existing.phone_number = contactPhone;
  }

  return Array.from(byKey.values())
    .filter((thread) => thread.hasInbound)
    .map(({ hasInbound: _hasInbound, ...thread }) => thread)
    .sort(
      (a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime()
    );
}

export async function fetchSmsThreadMessagesAdmin(
  admin: AdminClient,
  input: { workerId?: string | null; phone?: string | null }
): Promise<{ messages: SmsMessageRow[]; error: string | null }> {
  const { data, error } = await admin
    .from("sms_messages")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    return { messages: [], error: error.message };
  }

  const workers = await loadWorkersWithPhones(admin);
  const normalizedContact = normalizePhoneNumber(input.phone?.trim() ?? "");
  const workerId = input.workerId?.trim() ?? "";

  const filtered = ((data ?? []) as Record<string, unknown>[])
    .map(mapSmsRow)
    .filter((row) => {
      if (workerId && row.worker_id === workerId) return true;
      if (!normalizedContact) return false;
      const from = normalizePhoneNumber(row.from_number);
      const to = normalizePhoneNumber(row.to_number);
      return (
        from === normalizedContact || to === normalizedContact
      );
    })
    .map((row) => {
      const worker =
        (row.worker_id
          ? workers.find((item) => item.id === row.worker_id)
          : null) ??
        findWorkerByPhone(
          workers,
          row.direction === "inbound" ? row.from_number : row.to_number
        );
      return {
        ...row,
        worker_name: worker ? getWorkerDisplayName(worker) : null,
      };
    });

  return { messages: filtered, error: null };
}

export async function markSmsThreadReadAdmin(
  admin: AdminClient,
  input: { workerId?: string | null; phone?: string | null }
): Promise<{ error: string | null; updated: number }> {
  const { messages, error } = await fetchSmsThreadMessagesAdmin(admin, input);
  if (error) return { error, updated: 0 };

  const unreadIds = messages
    .filter((row) => row.direction === "inbound" && !row.is_read)
    .map((row) => row.id);

  if (unreadIds.length === 0) return { error: null, updated: 0 };

  const { error: updateError } = await admin
    .from("sms_messages")
    .update({ is_read: true, updated_at: new Date().toISOString() })
    .in("id", unreadIds);

  if (updateError) return { error: updateError.message, updated: 0 };
  return { error: null, updated: unreadIds.length };
}

export async function composeSmsAdmin(
  admin: AdminClient,
  input: ComposeSmsInput & { created_by?: string | null }
): Promise<{
  error: string | null;
  sent: number;
  failed: number;
  queued: number;
  messages: SmsMessageRow[];
  dispatchErrors: SmsDispatchError[];
}> {
  const body = input.message_body?.trim() ?? "";
  if (!body) {
    return {
      error: "Message body is required.",
      sent: 0,
      failed: 0,
      queued: 0,
      messages: [],
      dispatchErrors: [],
    };
  }

  const { workers, error: resolveError } = await resolveRecipientWorkers(admin, input);
  if (resolveError) {
    return {
      error: resolveError,
      sent: 0,
      failed: 0,
      queued: 0,
      messages: [],
      dispatchErrors: [],
    };
  }

  const fromNumber = normalizePhoneNumber(getTwilioFromNumber() ?? "") ?? "";
  const projectId = input.project_id?.trim() || input.project_ids?.[0]?.trim() || null;
  const scheduleLater = input.send_mode === "scheduled";
  const scheduledAt = scheduleLater ? input.scheduled_at?.trim() || null : null;

  if (scheduleLater && !scheduledAt) {
    return {
      error: "scheduled_at is required when scheduling for later.",
      sent: 0,
      failed: 0,
      queued: 0,
      messages: [],
      dispatchErrors: [],
    };
  }

  const created: SmsMessageRow[] = [];
  const dispatchErrors: SmsDispatchError[] = [];
  let sent = 0;
  let failed = 0;
  let queued = 0;

  for (const worker of workers) {
    const to = toE164Phone(worker.phone);
    if (!to) {
      failed += 1;
      dispatchErrors.push({
        worker_id: worker.id,
        phone: worker.phone ?? undefined,
        error: `Invalid phone number: ${worker.phone ?? "missing"}`,
      });
      continue;
    }

    if (scheduleLater) {
      const { data, error } = await admin
        .from("sms_messages")
        .insert([
          {
            direction: "outbound",
            from_number: fromNumber,
            to_number: to,
            message_body: body,
            status: "queued",
            worker_id: worker.id,
            project_id: projectId,
            is_read: true,
            scheduled_at: scheduledAt,
            recurrence: input.recurrence?.trim() || null,
            created_by: input.created_by ?? null,
          },
        ])
        .select("*")
        .single();

      if (error || !data) {
        failed += 1;
        dispatchErrors.push({
          worker_id: worker.id,
          phone: to,
          error: error?.message ?? "Failed to queue SMS in database.",
        });
        console.error("[sms] queue insert failed:", error?.message, { workerId: worker.id, to });
        continue;
      }
      queued += 1;
      created.push(mapSmsRow(data as Record<string, unknown>));
      continue;
    }

    const twilioResult = await sendTwilioSms({
      to,
      body,
      prependPrefix: true,
    });
    const status = twilioResult.error ? "failed" : "sent";
    if (twilioResult.error) {
      failed += 1;
      dispatchErrors.push({
        worker_id: worker.id,
        phone: to,
        error: twilioResult.error,
        twilioCode: twilioResult.twilioCode,
      });
    } else {
      sent += 1;
    }

    const errorDetail = twilioResult.error
      ? twilioResult.twilioCode
        ? `[${twilioResult.twilioCode}] ${twilioResult.error}`
        : twilioResult.error
      : null;

    const { data, error } = await admin
      .from("sms_messages")
      .insert([
        {
          direction: "outbound",
          from_number: fromNumber,
          to_number: to,
          message_body: twilioResult.body,
          status,
          worker_id: worker.id,
          project_id: projectId,
          is_read: true,
          scheduled_at: null,
          recurrence: null,
          twilio_sid: twilioResult.sid,
          error_message: errorDetail,
          created_by: input.created_by ?? null,
        },
      ])
      .select("*")
      .single();

    if (error || !data) {
      console.error("[sms] outbound insert failed:", error?.message, {
        workerId: worker.id,
        to,
        status,
        twilioSid: twilioResult.sid,
      });
      if (!twilioResult.error) {
        failed += 1;
        sent -= 1;
        dispatchErrors.push({
          worker_id: worker.id,
          phone: to,
          error: error?.message ?? "SMS sent via Twilio but failed to save to database.",
        });
      }
      continue;
    }

    created.push(mapSmsRow(data as Record<string, unknown>));
  }

  if (created.length === 0 && failed === 0 && queued === 0) {
    return {
      error: "No recipients were eligible for SMS delivery.",
      sent: 0,
      failed: 0,
      queued: 0,
      messages: [],
      dispatchErrors,
    };
  }

  const summaryError =
    failed > 0 && sent === 0 && queued === 0
      ? dispatchErrors[0]?.error ?? "All SMS dispatches failed."
      : failed > 0
        ? `${failed} recipient(s) failed.`
        : null;

  return {
    error: summaryError,
    sent,
    failed,
    queued,
    messages: created,
    dispatchErrors,
  };
}

export async function ingestInboundSmsAdmin(
  admin: AdminClient,
  input: { from: string; body: string; messageSid?: string | null }
): Promise<{ error: string | null; message: SmsMessageRow | null }> {
  const from = normalizePhoneNumber(String(input.from ?? "").trim()) ||
    String(input.from ?? "").trim();
  const body = String(input.body ?? "").trim();
  if (!from || !body) {
    return { error: "From and Body are required.", message: null };
  }

  const workers = await loadWorkersWithPhones(admin);
  // Also search all workers (including without normalized phone) for matching.
  const { data: allWorkers } = await admin
    .from("workers")
    .select("id, phone, full_name, first_name, last_name");
  const matched =
    findWorkerByPhone(workers, from) ??
    ((allWorkers ?? []) as WorkerPhoneRow[]).find((worker) =>
      phonesMatch(worker.phone, from)
    ) ??
    null;

  const toNumber =
    normalizePhoneNumber(getTwilioFromNumber() ?? "") ||
    getTwilioFromNumber() ||
    "";

  const { data, error } = await admin
    .from("sms_messages")
    .insert([
      {
        direction: "inbound",
        from_number: from,
        to_number: toNumber,
        message_body: body,
        status: "received",
        worker_id: matched?.id ?? null,
        project_id: null,
        is_read: false,
        twilio_sid: input.messageSid?.trim() || null,
      },
    ])
    .select("*")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Failed to save inbound SMS.", message: null };
  }

  return { error: null, message: mapSmsRow(data as Record<string, unknown>) };
}

export async function replySmsAdmin(
  admin: AdminClient,
  input: {
    to: string;
    message_body: string;
    worker_id?: string | null;
    project_id?: string | null;
    created_by?: string | null;
  }
): Promise<{ error: string | null; message: SmsMessageRow | null }> {
  const to = toE164Phone(input.to);
  if (!to) return { error: "Invalid recipient phone number.", message: null };
  const body = input.message_body?.trim() ?? "";
  if (!body) return { error: "Message body is required.", message: null };

  const twilioResult = await sendTwilioSms({ to, body, prependPrefix: true });
  const fromNumber = normalizePhoneNumber(getTwilioFromNumber() ?? "") ?? "";
  const errorDetail = twilioResult.error
    ? twilioResult.twilioCode
      ? `[${twilioResult.twilioCode}] ${twilioResult.error}`
      : twilioResult.error
    : null;

  const { data, error } = await admin
    .from("sms_messages")
    .insert([
      {
        direction: "outbound",
        from_number: fromNumber,
        to_number: to,
        message_body: twilioResult.body,
        status: twilioResult.error ? "failed" : "sent",
        worker_id: input.worker_id ?? null,
        project_id: input.project_id ?? null,
        is_read: true,
        twilio_sid: twilioResult.sid,
        error_message: errorDetail,
        created_by: input.created_by ?? null,
      },
    ])
    .select("*")
    .single();

  if (error || !data) {
    return {
      error: twilioResult.error ?? error?.message ?? "Failed to save reply.",
      message: null,
    };
  }

  if (twilioResult.error) {
    return { error: errorDetail, message: mapSmsRow(data as Record<string, unknown>) };
  }

  return { error: null, message: mapSmsRow(data as Record<string, unknown>) };
}
