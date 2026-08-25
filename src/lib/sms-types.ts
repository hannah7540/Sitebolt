export type SmsDirection = "inbound" | "outbound";

export type SmsMessageStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "failed"
  | "received";

export type SmsTargetMode = "all_workers" | "by_project" | "selected_workers";

export type SmsFolder = "inbox" | "sent" | "completed";

export type SmsSendMode = "immediate" | "scheduled";

export const SMS_OUTBOUND_PREFIX = "[A PLUS]: ";

export const SMS_SEGMENT_LENGTH = 160;

export interface SmsMessageRow {
  id: string;
  direction: SmsDirection;
  from_number: string;
  to_number: string;
  message_body: string;
  status: SmsMessageStatus;
  worker_id: string | null;
  project_id: string | null;
  is_read: boolean;
  is_completed: boolean;
  scheduled_at: string | null;
  recurrence: string | null;
  twilio_sid: string | null;
  error_message: string | null;
  created_by: string | null;
  created_at: string;
  updated_at?: string | null;
  worker_name?: string | null;
}

export interface SmsDispatchError {
  worker_id?: string;
  phone?: string;
  error: string;
  twilioCode?: string | number | null;
}

export interface SmsThreadSummary {
  threadKey: string;
  worker_id: string | null;
  worker_name: string | null;
  phone_number: string;
  last_message: string;
  last_at: string;
  unread_count: number;
  message_count: number;
  is_completed: boolean;
}

export interface ComposeSmsInput {
  message_body: string;
  target_mode: SmsTargetMode;
  worker_ids?: string[];
  project_ids?: string[];
  project_id?: string | null;
  send_mode: SmsSendMode;
  scheduled_at?: string | null;
  recurrence?: string | null;
}

export const SMS_TARGET_MODE_LABELS: Record<SmsTargetMode, string> = {
  all_workers: "All Workers",
  by_project: "By Project",
  selected_workers: "Individual Workers",
};

export const SMS_RECURRENCE_OPTIONS = [
  { value: "", label: "None" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
] as const;
