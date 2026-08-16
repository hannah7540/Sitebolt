"use client";

import { useEffect, useState } from "react";
import { resolveAuthWorkerFromSession } from "@/lib/auth-profile";
import { fetchWorkers } from "@/lib/supabase";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { DEFAULT_ADMIN_PROFILE_NAME } from "@/lib/user-session";
import { getWorkerDisplayName } from "@/lib/worker-utils";

/** Resolve the signed-in user's display name from Supabase auth + linked worker. */
export function useAuthProfileDisplay() {
  const [profileName, setProfileName] = useState(DEFAULT_ADMIN_PROFILE_NAME);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [profileEmail, setProfileEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (cancelled) return;

      setProfileEmail(user?.email?.trim() ?? null);

      const metadataName =
        typeof user?.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name.trim()
          : null;

      const authSession = await resolveAuthWorkerFromSession();
      if (cancelled) return;

      if (authSession.workerId) {
        const workers = await fetchWorkers();
        const worker = workers.find((row) => row.id === authSession.workerId);
        if (worker) {
          setProfileName(getWorkerDisplayName(worker));
          setProfilePhotoUrl(worker.photo_url?.trim() || null);
          setLoading(false);
          return;
        }
      }

      setProfilePhotoUrl(null);
      if (metadataName) {
        setProfileName(metadataName);
      }

      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { profileName, profilePhotoUrl, profileEmail, loading };
}
