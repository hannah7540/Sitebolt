"use client";

import type { Worker } from "@/lib/supabase";
import type { SiteFormSubmission } from "@/lib/site-forms";
import SiteFormDetailModal from "./SiteFormDetailModal";
import SafetyWalkDetailModal from "./SafetyWalkDetailModal";

interface SiteFormDetailRouterProps {
  form: SiteFormSubmission;
  workers: Worker[];
  onClose: () => void;
  onMarkRead?: () => Promise<void> | void;
  markingRead?: boolean;
  embedded?: boolean;
}

export default function SiteFormDetailRouter({
  form,
  workers,
  onClose,
  onMarkRead,
  markingRead,
  embedded = false,
}: SiteFormDetailRouterProps) {
  if (form.form_type === "safety_walk") {
    return (
      <SafetyWalkDetailModal
        form={form}
        workers={workers}
        onClose={onClose}
        onMarkRead={onMarkRead}
        markingRead={markingRead}
        embedded={embedded}
      />
    );
  }

  return (
    <SiteFormDetailModal
      form={form}
      workers={workers}
      onClose={onClose}
      onMarkRead={onMarkRead}
      markingRead={markingRead}
      embedded={embedded}
    />
  );
}
