"use client";

import { MessageSquare } from "lucide-react";
import type { Worker } from "@/lib/supabase";
import type { SiteFormSubmission } from "@/lib/site-forms";
import { formatSiteFormDate } from "@/lib/site-forms";
import {
  getSiteFormSubmitterName,
  getToolboxTalkTopic,
} from "@/lib/dashboard-form-utils";
import ProjectFormFeedWidget from "./ProjectFormFeedWidget";

interface ProjectToolboxTalksWidgetProps {
  forms: SiteFormSubmission[];
  workers: Worker[];
  loading?: boolean;
  onOpenList: () => void;
  onSelectForm: (form: SiteFormSubmission) => void;
}

export default function ProjectToolboxTalksWidget({
  forms,
  workers,
  loading = false,
  onOpenList,
  onSelectForm,
}: ProjectToolboxTalksWidgetProps) {
  const toolboxForms = forms.filter((form) => form.form_type === "toolbox_talk");
  const recent = toolboxForms.slice(0, 5);

  return (
    <ProjectFormFeedWidget
      icon={MessageSquare}
      title="Toolbox Talks"
      description="Recent toolbox topics, conductors, and attendance."
      countLabel={`${toolboxForms.length} talk${toolboxForms.length === 1 ? "" : "s"}`}
      loading={loading}
      emptyMessage="No toolbox talks submitted yet."
      onOpenList={onOpenList}
      onSelectRow={(id) => {
        const form = toolboxForms.find((row) => row.id === id);
        if (form) onSelectForm(form);
      }}
      rows={recent.map((form) => {
        const attendeeCount = form.attendees.filter((attendee) => attendee.present).length;
        return {
          id: form.id,
          title: getToolboxTalkTopic(form),
          subtitle: `${getSiteFormSubmitterName(form, workers)} · ${formatSiteFormDate(form.form_date)}`,
          meta: `${attendeeCount} attendee${attendeeCount === 1 ? "" : "s"}`,
        };
      })}
    />
  );
}
