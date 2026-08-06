"use client";

import { X } from "lucide-react";
import {
  SITE_FORM_LABELS,
  SITE_FORM_SHORT_LABELS,
  formatSiteFormDate,
  type SiteFormSubmission,
  type SiteFormType,
} from "@/lib/site-forms";
import { modalOverlayClass, modalClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface SiteFormsListModalProps {
  forms: SiteFormSubmission[];
  projectName: string;
  formType?: SiteFormType;
  title?: string;
  onClose: () => void;
  onSelectForm: (form: SiteFormSubmission) => void;
}

export default function SiteFormsListModal({
  forms,
  projectName,
  formType,
  title = "Site Forms & Safety",
  onClose,
  onSelectForm,
}: SiteFormsListModalProps) {
  const visibleForms = formType
    ? forms.filter((form) => form.form_type === formType)
    : forms;
  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={`${modalClass} max-w-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            <p className="text-sm text-slate-500">{projectName}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        {visibleForms.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            No submissions for this project yet.
          </p>
        ) : (
          <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
            {visibleForms.map((form) => (
              <li key={form.id}>
                <button
                  type="button"
                  onClick={() => onSelectForm(form)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-left hover:border-orange-300 hover:bg-orange-50/40"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">
                        {SITE_FORM_LABELS[form.form_type]}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatSiteFormDate(form.form_date)}
                        {form.location_scope ? ` · ${form.location_scope}` : ""}
                      </p>
                    </div>
                    <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-700">
                      {SITE_FORM_SHORT_LABELS[form.form_type]}
                    </span>
                  </div>
                  <p className={cn("mt-1 text-xs text-slate-500")}>
                    {form.attendees.length} attendee
                    {form.attendees.length === 1 ? "" : "s"}
                    {form.additional_workers.length > 0
                      ? ` · ${form.additional_workers.length} additional`
                      : ""}{" "}
                    · {form.photo_urls.length} photo
                    {form.photo_urls.length === 1 ? "" : "s"}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
