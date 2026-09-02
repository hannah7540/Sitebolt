export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { readSupabaseUrl } from "@/lib/supabase/env";

const ALLOWED_HOST_SUFFIXES = [".supabase.co", ".supabase.in"];
const ALLOWED_HOSTS = new Set([
  "www.site-bolt.com.au",
  "site-bolt.com.au",
]);

function isAllowedPdfUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname.toLowerCase();
    if (ALLOWED_HOSTS.has(host)) return true;
    if (ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
      return url.pathname.includes("/storage/v1/object/");
    }
    const configured = readSupabaseUrl();
    if (configured) {
      const origin = new URL(configured).hostname.toLowerCase();
      if (host === origin) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("url")?.trim() ?? "";
  if (!raw || !isAllowedPdfUrl(raw)) {
    return NextResponse.json({ error: "Invalid PDF URL." }, { status: 400 });
  }

  const upstream = await fetch(raw, {
    cache: "no-store",
    redirect: "follow",
  });

  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Failed to load PDF (${upstream.status}).` },
      { status: 502 }
    );
  }

  const contentType = upstream.headers.get("content-type") || "application/pdf";
  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": contentType.includes("pdf") ? "application/pdf" : contentType,
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
