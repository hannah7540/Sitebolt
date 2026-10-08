export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { sendEmail } from "@/lib/email-service";
import {
  formatSalesEnquiryModuleLabels,
  SALES_ENQUIRIES_TABLE,
  validateSalesEnquiry,
} from "@/lib/sales-enquiry";

const INQUIRY_NOTIFY_EMAIL = "hannah@site-bolt.com.au";

type EnquiryPayload = NonNullable<ReturnType<typeof validateSalesEnquiry>["payload"]>;
type EnquiryInsertRow = EnquiryPayload & { source_host: string | null; state?: string | null };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatAedtTimestamp(date = new Date()): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(date);
}

function mentionedColumn(message: string): string | null {
  const quoted = message.match(/['"]([a-z_]+)['"]/i);
  return quoted?.[1]?.toLowerCase() ?? null;
}

function isSchemaMismatchError(message: string): boolean {
  const lower = (message || "").toLowerCase();
  return (
    lower.includes("does not exist") ||
    lower.includes("schema cache") ||
    lower.includes("could not find") ||
    lower.includes("column") ||
    lower.includes("violates not-null") ||
    lower.includes("violates check constraint") ||
    lower.includes("null value")
  );
}

async function insertSalesEnquiry(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  row: EnquiryInsertRow
): Promise<{ saved: boolean; error?: string }> {
  const attempt: Record<string, unknown> = { ...row };
  delete attempt.state;

  for (let i = 0; i < 6; i += 1) {
    const { error } = await admin.from(SALES_ENQUIRIES_TABLE).insert(attempt);
    if (!error) return { saved: true };

    const message = error.message || "Unknown insert error.";
    if (!isSchemaMismatchError(message)) {
      return { saved: false, error: message };
    }

    const column = mentionedColumn(message);
    if (column && column in attempt) {
      delete attempt[column];
      continue;
    }

    if ("notes" in attempt || "enquiry_type" in attempt) {
      delete attempt.notes;
      delete attempt.enquiry_type;
      continue;
    }

    return { saved: false, error: message };
  }

  return { saved: false, error: "Could not insert enquiry after schema retries." };
}

async function notifySalesTeam(payload: EnquiryPayload): Promise<boolean> {
  const submittedAt = formatAedtTimestamp();
  const inquiryType =
    payload.enquiry_type === "custom_build" ? "Custom software brief" : "General enquiry";
  const modules = formatSalesEnquiryModuleLabels(payload.modules_of_interest);
  const subject = `⚡ New SiteBolt Inquiry: ${payload.full_name} / ${payload.company_name}`;
  const fields: Array<[string, string]> = [
    ["Full Name", payload.full_name],
    ["Company Name", payload.company_name],
    ["Email Address", payload.work_email],
    ["Phone Number", payload.phone ?? "—"],
    ["Number of Employees", payload.fleet_team_size ?? "—"],
    ["Inquiry Type", inquiryType],
    ["Interested Modules", modules],
    ["Message / Brief", payload.notes?.trim() || "—"],
    ["Submitted", submittedAt],
  ];

  const text = ["New SiteBolt inquiry", "", ...fields.map(([label, value]) => `${label}: ${value}`)].join(
    "\n"
  );

  const rows = fields
    .map(
      ([label, value]) =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #2a3138;color:#9ca3af;font-size:12px;width:180px;vertical-align:top;">${escapeHtml(label)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #2a3138;color:#ffffff;font-size:14px;white-space:pre-wrap;">${escapeHtml(value)}</td>
        </tr>`
    )
    .join("");

  const html = `<div style="margin:0;padding:24px;background:#13171B;font-family:system-ui,-apple-system,Segoe UI,sans-serif;">
  <div style="max-width:640px;margin:0 auto;background:#1F2429;border:1px solid #2a3138;border-radius:16px;overflow:hidden;">
    <div style="padding:20px 24px;background:#161B20;border-bottom:1px solid #FF6B00;">
      <p style="margin:0;color:#FF6B00;font-size:11px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;">SiteBolt</p>
      <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;">New inquiry received</h1>
    </div>
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    <p style="margin:0;padding:16px 24px;color:#9ca3af;font-size:12px;">Reply directly to this email to contact ${escapeHtml(payload.full_name)}.</p>
  </div>
</div>`;

  const result = await sendEmail({
    to: [INQUIRY_NOTIFY_EMAIL],
    replyTo: payload.work_email,
    subject,
    text,
    html,
  });

  if (!result.sent) {
    console.warn("sales enquiry email not sent:", result.error);
    return false;
  }

  return true;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const validated = validateSalesEnquiry(body);
  if (!validated.ok || !validated.payload) {
    return NextResponse.json(
      { error: "Please check the highlighted fields.", errors: validated.errors },
      { status: 400 }
    );
  }

  let saved = false;
  let emailed = false;

  if (isSupabaseAdminConfigured()) {
    try {
      const admin = createSupabaseAdminClient();
      const insertResult = await insertSalesEnquiry(admin, {
        ...validated.payload,
        source_host: request.headers.get("host"),
      });
      saved = insertResult.saved;
      if (!insertResult.saved) {
        console.error("sales_enquiries insert failed:", insertResult.error);
      }
    } catch (error) {
      console.error("sales_enquiries insert threw:", error);
    }
  } else {
    console.warn("sales_enquiries skipped: admin client is not configured.");
  }

  try {
    emailed = await notifySalesTeam(validated.payload);
  } catch (cause) {
    console.warn("sales enquiry email notify skipped:", cause);
  }

  if (saved || emailed) {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    {
      error:
        "We could not save your enquiry just now. Please try again or email hannah@site-bolt.com.au.",
    },
    { status: 500 }
  );
}
