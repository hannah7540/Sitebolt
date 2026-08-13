export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { validatePassword } from "@/lib/password-validation";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

function copyCookies(from: NextResponse, to: NextResponse): void {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
}

function createSupabaseWithCookieBridge(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  let sessionResponse = NextResponse.next();

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
        sessionResponse = NextResponse.next();
        cookiesToSet.forEach(({ name, value, options }) => {
          sessionResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  return { supabase, getSessionResponse: () => sessionResponse };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const password = typeof body?.password === "string" ? body.password : "";

    const passwordError = validatePassword(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const cookieStore = await cookies();
    const { supabase, getSessionResponse } = createSupabaseWithCookieBridge(cookieStore);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Auth session missing" }, { status: 401 });
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    await supabase.auth.signOut();

    const response = NextResponse.json({ success: true });
    copyCookies(getSessionResponse(), response);
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
