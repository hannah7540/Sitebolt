import { supabase, isSupabaseConfigured } from "./supabase";
import {
  parseMissingColumnFromError,
  stripMissingColumn,
} from "./form-payload-utils";
import { isSupabaseMissingColumnError, isSupabaseRelationMissingError, isSupabaseSchemaCacheError } from "./supabase-errors";

const OPTIONAL_NOTIFICATION_COLUMNS = [
  "worker_id",
  "recipient_id",
  "is_read",
  "read",
  "metadata",
  "type",
] as const;

function firstNonEmpty(...values: unknown[]): string | null {
  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed) return trimmed;
  }
  return null;
}

export async function resolveWorkerAuthUserId(
  workerId: string
): Promise<{ userId: string | null; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { userId: null, error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("workers")
    .select("id, auth_user_id, user_id")
    .eq("id", workerId)
    .maybeSingle();

  if (error) {
    if (isSupabaseMissingColumnError(error)) {
      const retry = await supabase
        .from("workers")
        .select("id, auth_user_id")
        .eq("id", workerId)
        .maybeSingle();
      if (retry.error) {
        return { userId: null, error: retry.error.message };
      }
      const retryRow = retry.data as { auth_user_id?: string | null } | null;
      return {
        userId: firstNonEmpty(retryRow?.auth_user_id),
        error: null,
      };
    }
    return { userId: null, error: error.message };
  }

  const row = data as {
    auth_user_id?: string | null;
    user_id?: string | null;
  } | null;
  return {
    userId: firstNonEmpty(row?.auth_user_id, row?.user_id),
    error: null,
  };
}

export async function sendInductionReminderNotification(input: {
  workerId: string;
  inductionTitle: string;
  templateId: string;
}): Promise<{ error: string | null }> {
  if (!input.workerId.trim()) {
    return { error: "Worker id is required." };
  }

  const resolved = await resolveWorkerAuthUserId(input.workerId);
  if (resolved.error) return { error: resolved.error };
  if (!resolved.userId) {
    return {
      error: "This worker does not have a linked login account.",
    };
  }

  const inductionTitle = input.inductionTitle.trim() || "your assigned induction";
  let payload: Record<string, unknown> = {
    user_id: resolved.userId,
    recipient_id: resolved.userId,
    worker_id: input.workerId,
    title: "Induction Incomplete",
    message: `Please complete your assigned induction: ${inductionTitle}`,
    type: "induction_reminder",
    read: false,
    is_read: false,
    metadata: {
      template_id: input.templateId,
      sent_at: new Date().toISOString(),
    },
  };

  for (let attempt = 0; attempt <= OPTIONAL_NOTIFICATION_COLUMNS.length + 2; attempt += 1) {
    const { error } = await supabase.from("notifications").insert([payload]);
    if (!error) return { error: null };

    if (isSupabaseMissingColumnError(error)) {
      const parsed = parseMissingColumnFromError(error.message);
      if (parsed && parsed in payload) {
        if (parsed === "user_id" && payload.recipient_id) {
          payload = stripMissingColumn(payload, "user_id");
          continue;
        }
        payload = stripMissingColumn(payload, parsed);
        continue;
      }
    }

    if (isSupabaseRelationMissingError(error) || isSupabaseSchemaCacheError(error)) {
      return {
        error:
          "Notifications table is not available. Apply supabase/migrations/149_notifications.sql in Supabase.",
      };
    }

    return { error: error.message };
  }

  return { error: "Failed to send induction notification." };
}
