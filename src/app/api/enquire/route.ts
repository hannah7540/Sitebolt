export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import {
  SALES_ENQUIRIES_TABLE,
  validateSalesEnquiry,
} from "@/lib/sales-enquiry";

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
    const { error } = await admin.from(SALES_ENQUIRIES_TABLE).insert({
      ...validated.payload,
      source_host: request.headers.get("host"),
    });

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
