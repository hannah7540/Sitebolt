"use client";

import { useEffect } from "react";
import { resetPasswordLocationWithHash } from "@/lib/public-auth-paths";

/** Alias pages must not use server redirect() — that strips the token hash. */
export default function RedirectToSetYourPassword() {
  useEffect(() => {
    window.location.replace(resetPasswordLocationWithHash());
  }, []);

  return (
    <p className="p-6 text-sm text-slate-500">Redirecting to set your password…</p>
  );
}
