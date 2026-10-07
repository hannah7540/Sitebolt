export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { sendEmail } from "@/lib/email-service";
import {
  SALES_ENQUIRIES_TABLE,
  validateSalesEnquiry,
} from "@/lib/sales-enquiry";

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

async function notifySalesTeam(payload: NonNullable<
  ReturnType<typeof validateSalesEnquiry>["payload"]
>) {
  const isCustom = payload.enquiry_type === "custom_build";
  const subject = isCustom
    ? `Custom build brief — ${payload.company_name}`
    : `SiteBolt enquiry — ${payload.company_name}`;
  const lines = [
    `Name: ${payload.full_name}`,
    `Company: ${payload.company_name}`,
    `Email: ${payload.work_email}`,
    `Phone: ${payload.phone ?? "—"}`,
    `State: ${payload.state}`,
    `Team / fleet: ${payload.fleet_team_size ?? "—"}`,
    `Type: ${payload.enquiry_type}`,
    `Modules: ${payload.modules_of_interest.join(", ") || "—"}`,
    "",
    payload.notes ?? "",
  ];
  await sendEmail({
    to: ["support@site-bolt.com.au"],
    replyTo: payload.work_email,
    subject,
    text: lines.join("\n"),
    html: `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${lines
      .map((line) => line.replace(/</g, "&lt;"))
      .join("\n")}</pre>`,
  });
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
      { error: "Enquiry intake is temporarily unavailable. Please email support@site-bolt.com.au." },
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
            "We could not save your enquiry just now. Please try again or email support@site-bolt.com.au.",
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
          "We could not save your enquiry just now. Please try again or email support@site-bolt.com.au.",
      },
      { status: 500 }
    );
  }
}
