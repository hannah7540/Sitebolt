"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { Worker } from "@/lib/supabase";
import {
  SITE_FORM_CONFIGS,
  SITE_FORM_LABELS,
  SAFETY_WALK_STATUS_BADGE_CLASS,
  collectSafetyWalkGalleryPhotos,
  formatFormDataValue,
  formatSiteFormDate,
  getSafetyWalkFieldStatus,
  type SiteFormFieldDef,
  type SiteFormSubmission,
} from "@/lib/site-forms";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import FormBrandingHeader from "@/components/ui/FormBrandingHeader";
import ImageLightboxGallery from "@/components/ui/ImageLightboxGallery";
import SiteFormAdditionalWorkersDisplay from "@/components/workers/SiteFormAdditionalWorkersDisplay";
import { modalOverlayClass, modalClass, labelClass, sectionClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface SafetyWalkDetailModalProps {
  form: SiteFormSubmission;
  workers: Worker[];
  onClose: () => void;
}

function SafetyWalkQuestionCard({
  field,
  form,
  galleryIndexByUrl,
  onPhotoClick,
}: {
  field: SiteFormFieldDef;
  form: SiteFormSubmission;
  galleryIndexByUrl: Map<string, number>;
  onPhotoClick: (index: number) => void;
}) {
  const value = form.form_data[field.id];
  const status = getSafetyWalkFieldStatus(field, value);
  const photoUrl =
    field.photoFieldId && typeof form.form_data[field.photoFieldId] === "string"
      ? (form.form_data[field.photoFieldId] as string)
      : null;
  const galleryIndex = photoUrl ? galleryIndexByUrl.get(photoUrl) : undefined;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className={cn(labelClass, "flex-1")}>{field.label}</p>
        {status ? (
          <span
            className={cn(
              "shrink-0 rounded px-2.5 py-0.5 text-xs font-bold",
              SAFETY_WALK_STATUS_BADGE_CLASS[status.kind]
            )}
          >
            {status.label}
          </span>
        ) : null}
      </div>

      {!status ? (
        <p className="mt-1 whitespace-pre-wrap text-sm font-medium text-slate-900">
          {formatFormDataValue(value ?? null)}
        </p>
      ) : field.type === "yes_no_with_photo" && typeof value === "string" && value === "no" ? (
        <p className="mt-1 text-sm text-slate-600">No hazards reported for this walk.</p>
      ) : null}

      {photoUrl ? (
        <button
          type="button"
          onClick={() => {
            if (galleryIndex != null) onPhotoClick(galleryIndex);
          }}
          className="mt-3 block overflow-hidden rounded-lg border border-slate-200 bg-white transition hover:border-orange-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
          aria-label={`View photo for ${field.label}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoUrl}
            alt={`${field.label} photo`}
            className="h-28 w-full object-cover sm:h-32 sm:w-40"
          />
        </button>
      ) : null}
    </div>
  );
}

export default function SafetyWalkDetailModal({
  form,
  workers,
  onClose,
}: SafetyWalkDetailModalProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const config = SITE_FORM_CONFIGS.safety_walk;

  const submitter = workers.find((worker) => worker.id === form.worker_id);
  const submitterName = submitter
    ? getWorkerDisplayName(submitter)
    : form.worker_id.slice(0, 8);

  const galleryPhotos = useMemo(() => collectSafetyWalkGalleryPhotos(form), [form]);
  const galleryIndexByUrl = useMemo(
    () => new Map(galleryPhotos.map((photo, index) => [photo.url, index])),
    [galleryPhotos]
  );

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={cn(modalClass, "max-w-2xl print:max-w-none print:border print:border-slate-400 print:shadow-none")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <FormBrandingHeader
            className="mb-0 flex-1 border-0 pb-0"
            title={SITE_FORM_LABELS.safety_walk}
            subtitle={`${formatSiteFormDate(form.form_date)}${
              form.form_time ? ` at ${form.form_time.slice(0, 5)}` : ""
            }`}
            meta={`Submitted by ${submitterName}`}
          />
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className={labelClass}>Location / scope</p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {form.location_scope || "Not recorded"}
            </p>
          </div>

          {config.sections.map((section) => (
            <div key={section.id}>
              <div className="mb-3 border-b border-slate-200 pb-2">
                <h3 className="text-base font-semibold text-slate-900">{section.title}</h3>
              </div>
              <div className="space-y-3">
                {section.fields.map((field) => (
                  <SafetyWalkQuestionCard
                    key={field.id}
                    field={field}
                    form={form}
                    galleryIndexByUrl={galleryIndexByUrl}
                    onPhotoClick={setLightboxIndex}
                  />
                ))}
              </div>
            </div>
          ))}

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
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <p className="font-medium text-slate-900">{attendee.worker_name}</p>
                    {attendee.signature_url ? (
                      <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white p-2">
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

          {form.submitter_signature_url ? (
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
          ) : null}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-700"
        >
          Close
        </button>
      </div>

      {lightboxIndex != null && galleryPhotos.length > 0 ? (
        <ImageLightboxGallery
          images={galleryPhotos.map((photo) => ({ url: photo.url, alt: photo.label }))}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </div>
  );
}
