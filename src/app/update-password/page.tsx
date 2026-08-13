import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import UpdatePasswordClient from "./UpdatePasswordClient";

export const dynamic = "force-dynamic";

export default async function UpdatePasswordPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      }
    >
      <UpdatePasswordClient initialHasSession={Boolean(user)} />
    </Suspense>
  );
}
