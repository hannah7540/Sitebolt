"use client";

import type { Worker } from "@/lib/supabase";
import type { SiteFormSubmission } from "@/lib/site-forms";
import SiteFormDetailModal from "./SiteFormDetailModal";
import SafetyWalkDetailModal from "./SafetyWalkDetailModal";

interface SiteFormDetailRouterProps {
  form: SiteFormSubmission;
  workers: Worker[];
  onClose: () => void;
}

export default function SiteFormDetailRouter({
  form,
  workers,
  onClose,
}: SiteFormDetailRouterProps) {
  if (form.form_type === "safety_walk") {
    return <SafetyWalkDetailModal form={form} workers={workers} onClose={onClose} />;
  }

  return <SiteFormDetailModal form={form} workers={workers} onClose={onClose} />;
}
