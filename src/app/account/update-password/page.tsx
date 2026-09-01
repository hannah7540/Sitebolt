"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { HardHat, Loader2 } from "lucide-react";
import AccountPasswordForm from "@/components/settings/AccountPasswordForm";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isPasswordRecoverySession } from "@/lib/auth-session-utils";
import { cardClass } from "@/lib/ui-classes";

const ACCOUNT_PASSWORD_PATH = "/account/update-password";

function UpdatePasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next");
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAccount() {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      const user = session?.user;

      if (!user) {
        router.replace(`/login?next=${encodeURIComponent(ACCOUNT_PASSWORD_PATH)}`);
        return;
      }

      if (session && isPasswordRecoverySession(session)) {
        router.replace("/setyourpassword");
        return;
      }

      if (!cancelled) {
        setEmail(user.email ?? null);
        setLoading(false);
      }
    }

    void loadAccount();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500">
              <HardHat className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">
                SiteBolt
              </p>
              <h1 className="text-2xl font-bold text-slate-900">Change password</h1>
            </div>
          </div>
          <Link
            href={nextPath?.startsWith("/") ? nextPath : "/worker-dashboard"}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Back to dashboard
          </Link>
        </div>

        <div className={cardClass + " p-6"}>
          {email ? <AccountPasswordForm userEmail={email} /> : null}
        </div>
      </div>
    </div>
  );
}

export default function UpdatePasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      }
    >
      <UpdatePasswordContent />
    </Suspense>
  );
}
