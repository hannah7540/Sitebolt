import type { SupabaseClient } from "@supabase/supabase-js";
import {
  notifySwmsAssignedAndStamp,
  sendComplianceReminders,
} from "@/lib/compliance-reminders";

/**
 * Notify workers about a new SWMS assignment (email, SMS, in-app) and stamp
 * last_reminded_at so the 7-day cron starts from this assignment.
 */
export async function notifyWorkersOfSwmsAssignment(
  admin: SupabaseClient,
  input: {
    workerIds: string[];
    swmsTitle: string;
    swmsId?: string | null;
  }
): Promise<{ emailed: number; errors: string[] }> {
  if (input.swmsId?.trim()) {
    const result = await notifySwmsAssignedAndStamp(admin, {
      workerIds: input.workerIds,
      swmsId: input.swmsId,
      swmsTitle: input.swmsTitle,
    });
    return { emailed: result.emailed, errors: result.errors };
  }

  const result = await sendComplianceReminders(admin, {
    kind: "swms",
    mode: "assigned",
    workerIds: input.workerIds,
    documentTitle: input.swmsTitle,
  });
  return { emailed: result.emailed, errors: result.errors };
}
