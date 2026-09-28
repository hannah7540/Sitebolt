import type { User } from "@supabase/supabase-js";
import { buildLoginRedirectPath } from "@/lib/auth-guard";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { buildWorkerFullName, getWorkerDisplayName } from "@/lib/worker-utils";

export type PrestartOperatorIdentity = {
  loading: boolean;
  hasSession: boolean;
  operatorName: string;
  workerId: string | null;
  userId: string | null;
};

export function currentPrestartReturnPath(): string {
  if (typeof window === "undefined") return "/pre-start";
  return `${window.location.pathname}${window.location.search}`;
}

export function prestartLoginHref(returnPath?: string | null): string {
  return buildLoginRedirectPath(returnPath?.trim() || currentPrestartReturnPath());
}

function nameFromAuthMetadata(user: User): string {
  const metadata = user.user_metadata ?? {};
  const fullName =
    typeof metadata.full_name === "string" ? metadata.full_name.trim() : "";
  if (fullName) return fullName;

  const combined = buildWorkerFullName(
    typeof metadata.first_name === "string" ? metadata.first_name : null,
    typeof metadata.last_name === "string" ? metadata.last_name : null
  );
  if (combined) return combined;

  return user.email?.trim() || "";
}

export async function resolvePrestartOperatorIdentity(): Promise<
  Omit<PrestartOperatorIdentity, "loading">
> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    return {
      hasSession: false,
      operatorName: "",
      workerId: null,
      userId: null,
    };
  }

  const metadataName = nameFromAuthMetadata(user);
  const selects = [
    "id, first_name, last_name, full_name, worker_name, name, email",
    "id, first_name, last_name, full_name, worker_name, email",
    "id, first_name, last_name, full_name, email",
    "id, first_name, last_name, email",
  ];

  for (const select of selects) {
    const byAuth = await supabase
      .from("workers")
      .select(select)
      .eq("auth_user_id", user.id)
      .maybeSingle();
    const { data: worker, error } = byAuth.data
      ? byAuth
      : await supabase.from("workers").select(select).eq("id", user.id).maybeSingle();

    if (error) {
      if (!error.message.toLowerCase().includes("column")) {
        break;
      }
      continue;
    }

    if (worker) {
      const row = worker as {
        id?: string;
        first_name?: string | null;
        last_name?: string | null;
        full_name?: string | null;
        worker_name?: string | null;
        name?: string | null;
        email?: string | null;
      };
      return {
        hasSession: true,
        operatorName: getWorkerDisplayName(row, metadataName || ""),
        workerId: row.id ? String(row.id) : null,
        userId: user.id,
      };
    }
    break;
  }

  return {
    hasSession: true,
    operatorName: metadataName,
    workerId: null,
    userId: user.id,
  };
}
