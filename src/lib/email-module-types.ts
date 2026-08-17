export type EmailDirection = "inbound" | "outbound";

export type EmailMessageStatus =
  | "draft"
  | "scheduled"
  | "sent"
  | "failed"
  | "cancelled"
  | "paused"
  | "received";

export type EmailTargetMode =
  | "all_workers"
  | "selected_workers"
  | "by_project"
  | "custom_emails";

export type EmailRecurrenceRule = "daily" | "weekly" | "fortnightly" | "monthly";

export type EmailFolder = "inbox" | "sent" | "scheduled" | "templates";

export interface EmailTargetConfig {
  worker_ids?: string[];
  project_ids?: string[];
  custom_emails?: string[];
}

export interface EmailTemplateRow {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  body_text: string | null;
  category: string;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailMessageRow {
  id: string;
  thread_id: string | null;
  parent_message_id: string | null;
  direction: EmailDirection;
  status: EmailMessageStatus;
  subject: string;
  body_html: string;
  body_text: string | null;
  from_email: string | null;
  to_emails: string[];
  cc_emails: string[];
  target_mode: EmailTargetMode | null;
  target_config: EmailTargetConfig;
  template_id: string | null;
  scheduled_for: string | null;
  recurrence_rule: EmailRecurrenceRule | null;
  recurrence_active: boolean;
  last_sent_at: string | null;
  sent_at: string | null;
  is_read: boolean;
  read_at: string | null;
  sender_worker_id: string | null;
  sender_name: string | null;
  sender_email: string | null;
  external_message_id: string | null;
  error_message: string | null;
  attachment_urls: string[];
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailListFilters {
  folder: EmailFolder;
  search?: string;
  dateFrom?: string | null;
  dateTo?: string | null;
  projectId?: string | null;
  workerId?: string | null;
}

export interface ComposeEmailInput {
  subject: string;
  body_html: string;
  body_text?: string | null;
  target_mode: EmailTargetMode;
  target_config: EmailTargetConfig;
  template_id?: string | null;
  send_mode: "immediate" | "scheduled";
  scheduled_for?: string | null;
  recurrence_rule?: EmailRecurrenceRule | null;
  created_by: string;
  created_by_name: string;
  sender_email?: string | null;
}

export interface SaveEmailTemplateInput {
  name: string;
  subject: string;
  body_html: string;
  body_text?: string | null;
  category?: string;
  created_by?: string | null;
  created_by_name?: string | null;
}

export interface InboundEmailAttachmentInput {
  filename: string;
  contentType?: string;
  content: string;
}

export interface EmailSignatureRow {
  id: string;
  name: string;
  body_html: string;
  body_text: string | null;
  is_live: boolean;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaveEmailSignatureInput {
  id?: string | null;
  name?: string;
  body_html: string;
  body_text?: string | null;
  make_live?: boolean;
}

export interface InboundEmailWebhookPayload {
  from?: string;
  to?: string | string[];
  subject?: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
  thread_id?: string;
  attachments?: InboundEmailAttachmentInput[];
}

export const EMAIL_RECURRENCE_OPTIONS: Array<{
  id: EmailRecurrenceRule;
  label: string;
}> = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "fortnightly", label: "Fortnightly" },
  { id: "monthly", label: "Monthly" },
];

export const EMAIL_TARGET_MODE_LABELS: Record<EmailTargetMode, string> = {
  all_workers: "All Workers",
  selected_workers: "Select Workers",
  by_project: "By Project / Site",
  custom_emails: "Specific Users / Custom Emails",
};
