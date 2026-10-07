export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { sendEmail } from "@/lib/email-service";
import {
  CUSTOM_BUILD_MODULE_ID,
  SALES_ENQUIRIES_TABLE,
  SALES_ENQUIRY_MODULES,
  validateSalesEnquiry,
} from "@/lib/sales-enquiry";

const INQUIRY_NOTIFY_EMAIL =
  process.env.SALES_INQUIRY_EMAIL?.trim() || "hannah@site-bolt.com.au";

function isMissingColumnError(message: string): boolean {
  const lower = (message || "").toLowerCase();
  return (
    (lower.includes("notes") || lower.includes("enquiry_type")) &&
    (lower.includes("does not exist") ||
      lower.includes("schema cache") ||
      lower.includes("could not find") ||
      lower.includes("column"))
  );
}

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

function moduleLabels(ids: string[]): string {
  const labels: string[] = SALES_ENQUIRY_MODULES.filter((item) => ids.includes(item.id)).map(
    (item) => item.label
  );
  if (ids.includes(CUSTOM_BUILD_MODULE_ID)) labels.push("Custom software");
  return labels.join(", ") || "—";
}

async function notifySalesTeam(payload: NonNullable<
  ReturnType<typeof validateSalesEnquiry>["payload"]
>) {
  const submittedAt = formatAedtTimestamp();
  const inquiryType =
    payload.enquiry_type === "custom_build" ? "Custom software brief" : "General enquiry";
  const subject = `⚡ New SiteBolt Inquiry: ${payload.full_name} / ${payload.company_name}`;
  const fields: Array<[string, string]> = [
    ["Full Name", payload.full_name],
    ["Company Name", payload.company_name],
    ["Email Address", payload.work_email],
    ["Phone Number", payload.phone ?? "—"],
    ["State / Region", payload.state],
    ["Team / Fleet Size", payload.fleet_team_size ?? "—"],
    ["Inquiry Type", inquiryType],
    ["Modules of Interest", moduleLabels(payload.modules_of_interest)],
    ["Message / Brief", payload.notes?.trim() || "—"],
    ["Submitted", submittedAt],
  ];

  const text = [
    "New SiteBolt inquiry",
    "",
    ...fields.map(([label, value]) => `${label}: ${value}`),
  ].join("\n");

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

  if (!result.sent && !result.simulated) {
    console.warn("sales enquiry email not sent:", result.error);
  }
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

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Enquiry intake is temporarily unavailable. Please email hannah@site-bolt.com.au." },
      { status: 503 }
    );
  }

  try {
    const admin = createSupabaseAdminClient();
    const row = {
      ...validated.payload,
      source_host: request.headers.get("host"),
    };
    let { error } = await admin.from(SALES_ENQUIRIES_TABLE).insert(row);

    if (error && isMissingColumnError(error.message)) {
      const { notes: _notes, enquiry_type: _type, ...legacyRow } = row;
      ({ error } = await admin.from(SALES_ENQUIRIES_TABLE).insert(legacyRow));
    }

    if (error) {
      console.error("sales_enquiries insert failed:", error.message);
      return NextResponse.json(
        {
          error:
            "We could not save your enquiry just now. Please try again or email hannah@site-bolt.com.au.",
        },
        { status: 500 }
      );
    }

    try {
      await notifySalesTeam(validated.payload);
    } catch (cause) {
      console.warn("sales enquiry email notify skipped:", cause);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("sales_enquiries insert threw:", error);
    return NextResponse.json(
      {
        error:
          "We could not save your enquiry just now. Please try again or email hannah@site-bolt.com.au.",
      },
      { status: 500 }
    );
  }
}
