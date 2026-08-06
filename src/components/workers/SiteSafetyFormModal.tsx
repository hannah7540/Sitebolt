"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { Worker } from "@/lib/supabase";
import {
  fetchWorkersForProject,
  insertSiteForm,
} from "@/lib/supabase";
import {
  SITE_FORM_CONFIGS,
  SITE_FORM_LABELS,
  defaultFormData,
  getSiteFormFields,
  type SiteFormAttendee,
  type SiteFormAdditionalWorker,
  type SiteFormData,
  type SiteFormFieldValue,
  type SiteFormType,
} from "@/lib/site-forms";
import {
  uploadSiteFormPhoto,
  uploadSiteFormSignature,
} from "@/lib/site-form-upload";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import SiteFormFieldInput from "./SiteFormFieldInput";
import SiteFormAdditionalWorkersSection, {
  type AdditionalWorkerDraft,
} from "./SiteFormAdditionalWorkersSection";
import SignatureCanvas from "@/components/prestart/SignatureCanvas";
import FormBrandingHeader from "@/components/ui/FormBrandingHeader";
import {
  modalOverlayClass,
  modalClass,
  inputClass,
  labelClass,
  sectionClass,
} from "@/lib/ui-classes";
import { localIsoDate } from "@/lib/timesheet-utils";

interface SiteSafetyFormModalProps {
  formType: SiteFormType;
  worker: Worker;
  projectId: string;
  projectName: string;
  onClose: () => void;
  onSubmitted: () => void;
}

type AttendeeState = {
  present: boolean;
  signatureDataUrl: string | null;
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

function getSectionPhotoFieldIds(formType: SiteFormType): string[] {
  const ids: string[] = [];
  for (const field of getSiteFormFields(formType)) {
    if (field.photoFieldId) ids.push(field.photoFieldId);
  }
  return ids;
}

export default function SiteSafetyFormModal({
  formType,
  worker,
  projectId,
  projectName,
  onClose,
  onSubmitted,
}: SiteSafetyFormModalProps) {
  const config = SITE_FORM_CONFIGS[formType];
  const sectionPhotoIds = useMemo(
    () => getSectionPhotoFieldIds(formType),
    [formType]
  );
  const now = useMemo(() => new Date(), []);
  const [formDate, setFormDate] = useState(localIsoDate(now));
  const [formTime, setFormTime] = useState(
    `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
  );
  const [locationScope, setLocationScope] = useState(projectName);
  const [formData, setFormData] = useState<SiteFormData>(() =>
    defaultFormData(formType)
  );
  const [sectionPhotoFiles, setSectionPhotoFiles] = useState<
    Record<string, File | null>
  >({});
  const [projectWorkers, setProjectWorkers] = useState<Worker[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(true);
  const [attendees, setAttendees] = useState<Record<string, AttendeeState>>({});
  const [additionalWorkers, setAdditionalWorkers] = useState<AdditionalWorkerDraft[]>([]);
  const [submitterSignature, setSubmitterSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchWorkersForProject(projectId).then((rows) => {
      if (cancelled) return;
      setProjectWorkers(rows);
      const initial: Record<string, AttendeeState> = {};
      for (const row of rows) {
        initial[row.id] = {
          present: row.id === worker.id,
          signatureDataUrl: null,
        };
      }
      setAttendees(initial);
      setLoadingWorkers(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, worker.id]);

  const setFormValue = (id: string, value: SiteFormFieldValue) => {
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const setSectionPhoto = (photoFieldId: string, file: File | null) => {
    setSectionPhotoFiles((prev) => ({ ...prev, [photoFieldId]: file }));
  };

  const toggleAttendee = (workerId: string, present: boolean) => {
    setAttendees((prev) => ({
      ...prev,
      [workerId]: {
        present,
        signatureDataUrl: present ? prev[workerId]?.signatureDataUrl ?? null : null,
      },
    }));
  };

  const setAttendeeSignature = (workerId: string, signature: string | null) => {
    setAttendees((prev) => ({
      ...prev,
      [workerId]: {
        present: prev[workerId]?.present ?? false,
        signatureDataUrl: signature,
      },
    }));
  };

  const validateBeforeSubmit = (): string | null => {
    for (const photoFieldId of sectionPhotoIds) {
      if (!sectionPhotoFiles[photoFieldId]) {
        const field = getSiteFormFields(formType).find(
          (f) => f.photoFieldId === photoFieldId
        );
        return `Please capture a photo for "${field?.label ?? photoFieldId}".`;
      }
    }

    for (const field of getSiteFormFields(formType)) {
      if (!field.required) continue;
      const value = formData[field.id];
      if (field.type === "multi_select" || field.type === "multi_select_other") {
        if (!Array.isArray(value) || value.length === 0) {
          return `Please complete "${field.label}".`;
        }
        if (
          field.type === "multi_select_other" &&
          value.includes("Other") &&
          field.otherFieldId &&
          !String(formData[field.otherFieldId] ?? "").trim()
        ) {
          return `Please specify "${field.label} — other".`;
        }
      } else if (typeof value === "string" && !value.trim()) {
        return `Please complete "${field.label}".`;
      }
    }

    if (!submitterSignature) {
      return "Please sign as the submitting worker.";
    }

    const presentAttendees = Object.entries(attendees).filter(([, state]) => state.present);
    for (const [workerId, state] of presentAttendees) {
      if (!state.signatureDataUrl) {
        const name = getWorkerDisplayName(
          projectWorkers.find((w) => w.id === workerId) ?? { email: workerId }
        );
        return `Please capture a signature for ${name}.`;
      }
    }

    for (const [index, row] of additionalWorkers.entries()) {
      const hasName = row.name.trim().length > 0;
      const hasSignature = Boolean(row.signatureDataUrl);
      if (hasName && !hasSignature) {
        return `Please capture a signature for additional worker ${index + 1}.`;
      }
      if (!hasName && hasSignature) {
        return `Please enter the full name for additional worker ${index + 1}.`;
      }
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = validateBeforeSubmit();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    const stamp = Date.now();
    const basePath = `site-forms/${projectId}/${formType}/${worker.id}/${stamp}`;

    try {
      const savedFormData: SiteFormData = { ...formData };
      const photoUrls: string[] = [];

      for (const photoFieldId of sectionPhotoIds) {
        const file = sectionPhotoFiles[photoFieldId];
        if (!file) continue;
        const url = await uploadSiteFormPhoto(
          file,
          `${basePath}/${photoFieldId.replace(/_/g, "-")}`
        );
        if (!url) {
          setError("Section photo upload failed. Check your connection and try again.");
          setSaving(false);
          return;
        }
        savedFormData[photoFieldId] = url;
        photoUrls.push(url);
      }

      const presentAttendees = Object.entries(attendees).filter(([, state]) => state.present);
      const attendeeRecords: SiteFormAttendee[] = [];
      for (const [workerId, state] of presentAttendees) {
        const row = projectWorkers.find((w) => w.id === workerId);
        const signatureUrl = state.signatureDataUrl
          ? await uploadSiteFormSignature(
              state.signatureDataUrl,
              `${basePath}/attendee-${workerId}`
            )
          : null;
        attendeeRecords.push({
          worker_id: workerId,
          worker_name: getWorkerDisplayName(row ?? { email: workerId }),
          present: true,
          signature_url: signatureUrl,
        });
      }

      const submitterSignatureUrl = await uploadSiteFormSignature(
        submitterSignature!,
        `${basePath}/submitter`
      );

      if (!submitterSignatureUrl) {
        setError("Signature upload failed. Check your connection and try again.");
        setSaving(false);
        return;
      }

      const additionalWorkerRecords: SiteFormAdditionalWorker[] = [];
      const completeAdditionalWorkers = additionalWorkers.filter(
        (row) => row.name.trim() && row.signatureDataUrl
      );

      for (const [index, row] of completeAdditionalWorkers.entries()) {
        const signatureUrl = await uploadSiteFormSignature(
          row.signatureDataUrl!,
          `${basePath}/additional-worker-${index + 1}`
        );
        if (!signatureUrl) {
          setError(
            "Additional worker signature upload failed. Check your connection and try again."
          );
          setSaving(false);
          return;
        }
        additionalWorkerRecords.push({
          name: row.name.trim(),
          signature: signatureUrl,
        });
      }

      const { error: submitError } = await insertSiteForm({
        formType,
        projectId,
        workerId: worker.id,
        formDate,
        formTime,
        locationScope,
        formData: savedFormData,
        photoUrls,
        attendees: attendeeRecords,
        additionalWorkers: additionalWorkerRecords,
        submitterSignatureUrl,
      });

      if (submitError) {
        setError(submitError);
        setSaving(false);
        return;
      }

      onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit form.");
      setSaving(false);
    }
  };

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={`${modalClass} max-w-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <FormBrandingHeader
            className="mb-0 flex-1 border-0 pb-0"
            title={SITE_FORM_LABELS[formType]}
            subtitle={config.description}
            meta={projectName}
          />
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className={sectionClass}>
            <p className="text-sm font-semibold text-slate-900">General details</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Date *">
                <input
                  type="date"
                  className={inputClass}
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  required
                />
              </Field>
              <Field label="Time *">
                <input
                  type="time"
                  className={inputClass}
                  value={formTime}
                  onChange={(e) => setFormTime(e.target.value)}
                  required
                />
              </Field>
            </div>
            <Field label="Location / scope of works *">
              <input
                className={inputClass}
                value={locationScope}
                onChange={(e) => setLocationScope(e.target.value)}
                required
              />
            </Field>
          </div>

          {config.sections.map((section) => (
            <div key={section.id} className={sectionClass}>
              <p className="text-sm font-semibold text-slate-900">{section.title}</p>
              <div className="space-y-4">
                {section.fields.map((field) => (
                  <SiteFormFieldInput
                    key={field.id}
                    field={field}
                    formData={formData}
                    onChange={setFormValue}
                    photoFiles={sectionPhotoFiles}
                    onPhotoCapture={setSectionPhoto}
                  />
                ))}
              </div>
            </div>
          ))}

          <div className={sectionClass}>
            <p className="text-sm font-semibold text-slate-900">Assigned workers</p>
            {loadingWorkers ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                Loading project workers…
              </div>
            ) : projectWorkers.length === 0 ? (
              <p className="text-sm text-slate-500">
                No workers are assigned to this project yet.
              </p>
            ) : (
              <div className="space-y-4">
                {projectWorkers.map((row) => {
                  const state = attendees[row.id] ?? {
                    present: false,
                    signatureDataUrl: null,
                  };
                  return (
                    <div
                      key={row.id}
                      className="rounded-lg border border-slate-200 bg-white p-3"
                    >
                      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
                        <input
                          type="checkbox"
                          checked={state.present}
                          onChange={(e) => toggleAttendee(row.id, e.target.checked)}
                          className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                        />
                        {getWorkerDisplayName(row)}
                        {row.id === worker.id && (
                          <span className="text-xs text-orange-600">(You)</span>
                        )}
                      </label>
                      {state.present && (
                        <div className="mt-3">
                          <p className="mb-1 text-xs text-slate-500">Attendee signature</p>
                          <SignatureCanvas
                            onChange={(sig) => setAttendeeSignature(row.id, sig)}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <SiteFormAdditionalWorkersSection
            workers={additionalWorkers}
            onChange={setAdditionalWorkers}
          />

          <div className={sectionClass}>
            <p className="text-sm font-semibold text-slate-900">
              Main submitter signature *
            </p>
            <p className="mb-2 text-xs text-slate-500">
              Signed by {getWorkerDisplayName(worker)}
            </p>
            <SignatureCanvas onChange={setSubmitterSignature} />
          </div>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit Form
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
