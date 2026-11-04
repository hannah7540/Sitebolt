"use client";

import { useEffect, useState } from "react";
import { resolveAuthWorkerFromSession } from "@/lib/auth-profile";
import { fetchWorkerById } from "@/lib/supabase";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  DEFAULT_ADMIN_PROFILE_NAME,
  PROFILE_LOADING_PLACEHOLDER,
} from "@/lib/user-session";
import { getWorkerDisplayName } from "@/lib/worker-utils";

/** Resolve the signed-in user's display name from Supabase auth + linked worker. */
export function useAuthProfileDisplay() {
  const [profileName, setProfileName] = useState(PROFILE_LOADING_PLACEHOLDER);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [profileEmail, setProfileEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();

    async function load() {
      setLoading(true);
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (cancelled) return;

      setProfileEmail(user?.email?.trim() ?? null);

      if (!user) {
        setProfileName(DEFAULT_ADMIN_PROFILE_NAME);
        setProfilePhotoUrl(null);
        setLoading(false);
        return;
      }

      const metadataName =
        typeof user.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name.trim()
          : null;

      const authSession = await resolveAuthWorkerFromSession();
      if (cancelled) return;

      if (authSession.workerId) {
        // Fetch only the signed-in worker — never scan the full roster for a name.
        const worker = await fetchWorkerById(authSession.workerId);
        if (cancelled) return;
        if (worker) {
          setProfileName(getWorkerDisplayName(worker));
          setProfilePhotoUrl(worker.photo_url?.trim() || null);
          setLoading(false);
          return;
        }
      }

      setProfilePhotoUrl(null);
      setProfileName(
        metadataName ||
          user.email?.split("@")[0]?.trim() ||
          DEFAULT_ADMIN_PROFILE_NAME
      );
      setLoading(false);
    }

    void load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void load();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return { profileName, profilePhotoUrl, profileEmail, loading };
}
