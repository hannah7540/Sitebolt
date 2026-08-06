"use client";

import { ShieldCheck } from "lucide-react";
import type { Worker } from "@/lib/supabase";
import type { SiteFormSubmission } from "@/lib/site-forms";
import { formatSiteFormDate } from "@/lib/site-forms";
import {
  countSafetyWalkOpenHazards,
  getSiteFormSubmitterName,
} from "@/lib/dashboard-form-utils";
import ProjectFormFeedWidget from "./ProjectFormFeedWidget";

interface ProjectSafetyWalksWidgetProps {
  forms: SiteFormSubmission[];
  workers: Worker[];
  loading?: boolean;
  onOpenList: () => void;
  onSelectForm: (form: SiteFormSubmission) => void;
}

export default function ProjectSafetyWalksWidget({
  forms,
  workers,
  loading = false,
  onOpenList,
  onSelectForm,
}: ProjectSafetyWalksWidgetProps) {
  const walkForms = forms.filter((form) => form.form_type === "safety_walk");
  const recent = walkForms.slice(0, 5);

  return (
    <ProjectFormFeedWidget
      icon={ShieldCheck}
      title="Safety Walks"
      description="Recent inspection records and open hazard counts."
      countLabel={`${walkForms.length} walk${walkForms.length === 1 ? "" : "s"}`}
      loading={loading}
      emptyMessage="No safety walks submitted yet."
      onOpenList={onOpenList}
      onSelectRow={(id) => {
        const form = walkForms.find((row) => row.id === id);
        if (form) onSelectForm(form);
      }}
      rows={recent.map((form) => {
        const openHazards = countSafetyWalkOpenHazards(form);
        return {
          id: form.id,
          title: getSiteFormSubmitterName(form, workers),
          subtitle: formatSiteFormDate(form.form_date),
          meta: `${openHazards} open hazard${openHazards === 1 ? "" : "s"}`,
          badge:
            openHazards > 0
              ? { label: "Follow-up", tone: "warning" as const }
              : { label: "Clear", tone: "success" as const },
        };
      })}
    />
  );
}
