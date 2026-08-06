"use client";

import { Sun } from "lucide-react";
import type { Worker } from "@/lib/supabase";
import type { SiteFormSubmission } from "@/lib/site-forms";
import { formatSiteFormDate } from "@/lib/site-forms";
import {
  formatSiteFormTime,
  getDailyPrestartCompletionCount,
  getSiteFormSubmitterName,
} from "@/lib/dashboard-form-utils";
import ProjectFormFeedWidget from "./ProjectFormFeedWidget";

interface ProjectDailyPrestartsWidgetProps {
  forms: SiteFormSubmission[];
  workers: Worker[];
  loading?: boolean;
  onOpenList: () => void;
  onSelectForm: (form: SiteFormSubmission) => void;
}

export default function ProjectDailyPrestartsWidget({
  forms,
  workers,
  loading = false,
  onOpenList,
  onSelectForm,
}: ProjectDailyPrestartsWidgetProps) {
  const dailyForms = forms.filter((form) => form.form_type === "daily_prestart");
  const recent = dailyForms.slice(0, 5);

  return (
    <ProjectFormFeedWidget
      icon={Sun}
      title="Daily Pre-Starts"
      description="Recent daily pre-start meeting logs for this project."
      countLabel={`${dailyForms.length} submission${dailyForms.length === 1 ? "" : "s"}`}
      loading={loading}
      emptyMessage="No daily pre-start meetings submitted yet."
      onOpenList={onOpenList}
      onSelectRow={(id) => {
        const form = dailyForms.find((row) => row.id === id);
        if (form) onSelectForm(form);
      }}
      rows={recent.map((form) => ({
        id: form.id,
        title: getSiteFormSubmitterName(form, workers),
        subtitle: `${formatSiteFormDate(form.form_date)}${
          form.form_time ? ` · ${formatSiteFormTime(form.form_time)}` : ""
        }`,
        meta: `${getDailyPrestartCompletionCount(form)} attendee${
          getDailyPrestartCompletionCount(form) === 1 ? "" : "s"
        } completed`,
      }))}
    />
  );
}
