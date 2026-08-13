"use client";

import { X } from "lucide-react";
import type { Worker } from "@/lib/supabase";
import {
  SITE_FORM_CONFIGS,
  SITE_FORM_LABELS,
  formatFormDataValue,
  formatSiteFormDate,
  getFormDataLabel,
  isInternalFormDataKey,
  isPhotoFormDataKey,
  type SiteFormSubmission,
} from "@/lib/site-forms";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import FormBrandingHeader from "@/components/ui/FormBrandingHeader";
import SiteFormAdditionalWorkersDisplay from "@/components/workers/SiteFormAdditionalWorkersDisplay";
import {
  modalOverlayClass,
  modalClass,
  labelClass,
  sectionClass,
} from "@/lib/ui-classes";

interface SiteFormDetailModalProps {
  form: SiteFormSubmission;
  workers: Worker[];
  onClose: () => void;
}

function collectPhotoUrls(form: SiteFormSubmission): string[] {
  const inline = Object.entries(form.form_data)
    .filter(([key, value]) => isPhotoFormDataKey(key) && typeof value === "string" && value)
    .map(([, value]) => value as string);
  const combined = [...form.photo_urls, ...inline];
  return Array.from(new Set(combined));
}

export default function SiteFormDetailModal({
  form,
  workers,
  onClose,
}: SiteFormDetailModalProps) {
  const submitter = workers.find((worker) => worker.id === form.worker_id);
  const submitterName = submitter
    ? getWorkerDisplayName(submitter)
    : form.worker_id.slice(0, 8);
  const config = SITE_FORM_CONFIGS[form.form_type];
  const allPhotos = collectPhotoUrls(form);

  const sectionPhotoFields = config.sections.flatMap((section) =>
    section.fields
      .filter((field) => field.photoFieldId)
      .map((field) => ({
        label: field.label,
        photoFieldId: field.photoFieldId!,
        answer: form.form_data[field.id],
        photoUrl:
          typeof form.form_data[field.photoFieldId!] === "string"
            ? (form.form_data[field.photoFieldId!] as string)
            : null,
      }))
  );

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={`${modalClass} max-w-3xl print:max-w-none print:border print:border-slate-400 print:shadow-none`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <FormBrandingHeader
            className="mb-0 flex-1 border-0 pb-0"
            title={SITE_FORM_LABELS[form.form_type]}
            subtitle={`${formatSiteFormDate(form.form_date)}${
              form.form_time ? ` at ${form.form_time.slice(0, 5)}` : ""
            }`}
            meta={`Submitted by ${submitterName}`}
          />
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <div className="space-y-4">
          <div className={sectionClass}>
            <p className={labelClass}>Location / scope</p>
            <p className="text-sm text-slate-900">
              {form.location_scope || "Not recorded"}
            </p>
          </div>

          {config.sections.map((section) => (
            <div key={section.id} className={sectionClass}>
              <p className="mb-2 text-sm font-semibold text-slate-900">
                {section.title}
              </p>
              <dl className="space-y-2">
                {section.fields.map((field) => {
                  const value = form.form_data[field.id];
                  const otherText =
                    field.otherFieldId &&
                    typeof form.form_data[field.otherFieldId] === "string"
                      ? (form.form_data[field.otherFieldId] as string)
                      : "";
                  const showOther =
                    Array.isArray(value) &&
                    value.includes("Other") &&
                    otherText.trim();

                  if (
                    field.type === "tri_state_with_photo" ||
                    field.type === "yes_no_with_photo"
                  ) {
                    return (
                      <div
                        key={field.id}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                      >
                        <dt className="text-xs font-medium text-slate-500">
                          {field.label}
                        </dt>
                        <dd className="mt-0.5 text-sm text-slate-900">
                          {formatFormDataValue(value ?? null)}
                        </dd>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={field.id}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                    >
                      <dt className="text-xs font-medium text-slate-500">
                        {field.label}
                      </dt>
                      <dd className="mt-0.5 whitespace-pre-wrap text-sm text-slate-900">
                        {formatFormDataValue(value ?? null)}
                      </dd>
                      {showOther && (
                        <dd className="mt-1 text-sm text-slate-700">
                          <span className="text-xs font-medium text-slate-500">
                            Other:{" "}
                          </span>
                          {otherText}
                        </dd>
                      )}
                    </div>
                  );
                })}
              </dl>
            </div>
          ))}

          {Object.entries(form.form_data).some(
            ([key]) =>
              !isInternalFormDataKey(key) &&
              !config.sections.some((section) =>
                section.fields.some((field) => field.id === key)
              )
          ) && (
            <div className={sectionClass}>
              <p className="mb-2 text-sm font-semibold text-slate-900">
                Additional data
              </p>
              <dl className="space-y-2">
                {Object.entries(form.form_data)
                  .filter(
                    ([key]) =>
                      !isInternalFormDataKey(key) &&
                      !config.sections.some((section) =>
                        section.fields.some((field) => field.id === key)
                      )
                  )
                  .map(([key, value]) => (
                    <div
                      key={key}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                    >
                      <dt className="text-xs font-medium text-slate-500">
                        {getFormDataLabel(form.form_type, key)}
                      </dt>
                      <dd className="mt-0.5 whitespace-pre-wrap text-sm text-slate-900">
                        {formatFormDataValue(value)}
                      </dd>
                    </div>
                  ))}
              </dl>
            </div>
          )}

          {sectionPhotoFields.length > 0 && (
            <div className={sectionClass}>
              <p className="mb-2 text-sm font-semibold text-slate-900">
                Section photos
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {sectionPhotoFields.map((row) =>
                  row.photoUrl ? (
                    <div key={row.photoFieldId}>
                      <p className="mb-1 text-xs font-medium text-slate-500">
                        {row.label} ({formatFormDataValue(row.answer ?? null)})
                      </p>
                      <a
                        href={row.photoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block overflow-hidden rounded-xl border border-slate-200 bg-white"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={row.photoUrl}
                          alt={row.label}
                          className="max-h-56 w-full object-contain"
                        />
                      </a>
                    </div>
                  ) : null
                )}
              </div>
            </div>
          )}

          {allPhotos.length > 0 && (
            <div className={sectionClass}>
              <p className="mb-2 text-sm font-semibold text-slate-900">Photos</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {allPhotos.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="Site form" className="max-h-56 w-full object-contain" />
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className={sectionClass}>
            <p className="mb-2 text-sm font-semibold text-slate-900">
              Signed attendees ({form.attendees.length})
            </p>
            {form.attendees.length === 0 ? (
              <p className="text-sm text-slate-500">No attendees recorded.</p>
            ) : (
              <ul className="space-y-3">
                {form.attendees.map((attendee) => (
                  <li
                    key={attendee.worker_id}
                    className="rounded-lg border border-slate-200 bg-white p-3"
                  >
                    <p className="font-medium text-slate-900">{attendee.worker_name}</p>
                    {attendee.signature_url ? (
                      <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={attendee.signature_url}
                          alt={`${attendee.worker_name} signature`}
                          className="max-h-24 w-full object-contain"
                        />
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">No signature stored.</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <SiteFormAdditionalWorkersDisplay
            workers={form.additional_workers}
            printFriendly
          />

          {form.submitter_signature_url && (
            <div className={sectionClass}>
              <p className="mb-2 text-sm font-semibold text-slate-900">
                Main submitter signature
              </p>
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={form.submitter_signature_url}
                  alt="Submitter signature"
                  className="max-h-32 w-full object-contain"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
