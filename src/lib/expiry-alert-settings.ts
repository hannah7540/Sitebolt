import { supabase, isSupabaseConfigured } from "./supabase";

export interface ExpiryAlertSettings {
  id: string;
  automated_emails_enabled: boolean;
  secondary_recipient_emails: string[];
  updated_at?: string;
}

const DEFAULT_SETTINGS: ExpiryAlertSettings = {
  id: "",
  automated_emails_enabled: true,
  secondary_recipient_emails: [],
};

function isMissingTableError(message: string, table: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes(table.toLowerCase()) &&
    (lower.includes("does not exist") ||
      lower.includes("could not find") ||
      lower.includes("schema cache"))
  );
}

function normalizeSettings(row: Record<string, unknown>): ExpiryAlertSettings {
  const secondary = row.secondary_recipient_emails;
  return {
    id: String(row.id ?? ""),
    automated_emails_enabled: row.automated_emails_enabled !== false,
    secondary_recipient_emails: Array.isArray(secondary)
      ? secondary.map((email) => String(email).trim()).filter(Boolean)
      : [],
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

export async function fetchExpiryAlertSettings(): Promise<ExpiryAlertSettings> {
  if (!isSupabaseConfigured()) return DEFAULT_SETTINGS;

  const { data, error } = await supabase
    .from("expiry_alert_settings")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error) {
    if (!isMissingTableError(error.message, "expiry_alert_settings")) {
      console.warn("fetchExpiryAlertSettings failed:", error.message);
    }
    return DEFAULT_SETTINGS;
  }

  if (!data) return DEFAULT_SETTINGS;
  return normalizeSettings(data as Record<string, unknown>);
}

export async function saveExpiryAlertSettings(input: {
  automated_emails_enabled: boolean;
  secondary_recipient_emails: string[];
}): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  const payload = {
    automated_emails_enabled: input.automated_emails_enabled,
    secondary_recipient_emails: input.secondary_recipient_emails
      .map((email) => email.trim())
      .filter(Boolean),
    updated_at: new Date().toISOString(),
  };

  const existing = await fetchExpiryAlertSettings();
  if (existing.id) {
    const { error } = await supabase
      .from("expiry_alert_settings")
      .update(payload)
      .eq("id", existing.id);
    return { error: error?.message ?? null };
  }

  const { error } = await supabase.from("expiry_alert_settings").insert([payload]);
  return { error: error?.message ?? null };
}

export function parseSecondaryRecipientInput(value: string): string[] {
  return value
    .split(/[,;\n]+/)
    .map((email) => email.trim())
    .filter(Boolean);
}

export function formatSecondaryRecipientsForInput(emails: string[]): string {
  return emails.join(", ");
}
