import { NextResponse } from "next/server";
import { ACTIVE_ORG_COOKIE } from "@/lib/active-organisation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const COOKIE_MAX_AGE = 2592000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function applyActiveOrgCookie(response: NextResponse, organisationId: string | null) {
  if (organisationId) {
    response.cookies.set({
      name: ACTIVE_ORG_COOKIE,
      value: organisationId,
      path: "/",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      httpOnly: false,
    });
    return;
  }

  response.cookies.set({
    name: ACTIVE_ORG_COOKIE,
    value: "",
    path: "/",
    sameSite: "lax",
    maxAge: 0,
    httpOnly: false,
  });
}

export async function POST(request: Request) {
  let body: { organisation_id?: string };
  try {
    body = (await request.json()) as { organisation_id?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const organisationId = String(body.organisation_id ?? "").trim();
  if (!organisationId || !UUID_RE.test(organisationId)) {
    return NextResponse.json({ error: "A valid organisation_id is required." }, { status: 400 });
  }

  const response = NextResponse.json({
    success: true,
    organisation_id: organisationId,
  });
  applyActiveOrgCookie(response, organisationId);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  applyActiveOrgCookie(response, null);
  return response;
}
