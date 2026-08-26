"use client";

import { useState } from "react";
import { ExternalLink, Pencil, Plus, Trash2, ZoomIn } from "lucide-react";
import {
  WORKER_CARD_CATEGORIES,
  WORKER_CARD_CATEGORY_LABELS,
  cardCategoryRequiresExpiry,
  createEmptyCardVocEntry,
  type WorkerCardCategory,
  type WorkerCardVocEntry,
} from "@/lib/worker-cards-vocs";
import { VOC_TYPE_OPTIONS, getVocDisplayTitle } from "@/lib/voc-utils";
import { getTicketStatus } from "@/lib/worker-utils";
import { getTicketBadgeLabel } from "@/lib/worker-compliance";
import DocumentCapture from "@/components/ui/DocumentCapture";
import ImageLightboxGallery from "@/components/ui/ImageLightboxGallery";
import { cn } from "@/lib/utils";
import { cardClass, inputClass, labelClass, sectionClass } from "@/lib/ui-classes";

interface WorkerCardsVocsEditorProps {
  workerId: string;
  entries: WorkerCardVocEntry[];
  onChange: (entries: WorkerCardVocEntry[]) => void;
  /** When false, viewing is allowed but editing/upload is disabled. */
  canEdit?: boolean;
}

function isPreviewableImage(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.includes(".pdf")) return false;
  return true;
}

function EntryForm({
  entry,
  workerId,
  onChange,
  onDone,
  onDelete,
}: {
  entry: WorkerCardVocEntry;
  workerId: string;
  onChange: (entry: WorkerCardVocEntry) => void;
  onDone: () => void;
  onDelete: () => void;
}) {
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  return (
    <div className={cn(sectionClass, "space-y-3")}>
      {entry.category === "plant_voc" ? (
        <label className="block space-y-1">
          <span className={labelClass}>VOC Type *</span>
          <select
            className={inputClass}
            value={entry.voc_type ?? ""}
            required
            onChange={(e) => {
              const vocType = e.target.value;
              onChange({
                ...entry,
                voc_type: vocType || null,
                ticket_name: vocType,
              });
            }}
          >
            <option value="">Select VOC type…</option>
            {VOC_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="block space-y-1">
          <span className={labelClass}>Ticket name</span>
          <input
            className={inputClass}
            value={entry.ticket_name}
            onChange={(e) => onChange({ ...entry, ticket_name: e.target.value })}
          />
        </label>
      )}
      <label className="block space-y-1">
        <span className={labelClass}>Ticket / licence number</span>
        <input
          className={inputClass}
          value={entry.ticket_number ?? ""}
          onChange={(e) =>
            onChange({ ...entry, ticket_number: e.target.value || null })
          }
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className={labelClass}>Issue date</span>
          <input
            type="date"
            className={inputClass}
            value={entry.issue_date ?? ""}
            onChange={(e) =>
              onChange({ ...entry, issue_date: e.target.value || null })
            }
          />
        </label>
        {entry.category !== "white_card" ? (
          <label className="block space-y-1">
            <span className={labelClass}>Expiry date</span>
            <input
              type="date"
              className={inputClass}
              value={entry.expiry_date ?? ""}
              onChange={(e) =>
                onChange({ ...entry, expiry_date: e.target.value || null })
              }
            />
          </label>
        ) : null}
      </div>
      <DocumentCapture
        label="Document attachment"
        file={pendingFile}
        onFileChange={setPendingFile}
        existingUrl={entry.document_url}
        existingUrlBack={entry.document_url_back}
        uploadedUrl={entry.document_url}
        uploadedUrlBack={entry.document_url_back}
        uploadPath={`workers/${workerId}/cards-vocs/${entry.id}/front`}
        uploadPathBack={`workers/${workerId}/cards-vocs/${entry.id}/back`}
        onUploaded={(url) => {
          onChange({ ...entry, document_url: url });
          setPendingFile(null);
        }}
        onUploadedBack={(url) => onChange({ ...entry, document_url_back: url })}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600"
        >
          Done
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      </div>
    </div>
  );
}

function EntrySummary({
  entry,
  onEdit,
  onDelete,
  canEdit,
}: {
  entry: WorkerCardVocEntry;
  onEdit: () => void;
  onDelete: () => void;
  canEdit: boolean;
}) {
  const requiresExpiry = cardCategoryRequiresExpiry(entry.category);
  const status = requiresExpiry ? getTicketStatus(entry.expiry_date) : "valid";
  const badgeStyles = {
    valid: "bg-emerald-100 text-emerald-800",
    expires_soon: "bg-amber-100 text-amber-800",
    expired: "bg-red-100 text-red-800",
    unknown: "bg-slate-100 text-slate-600",
  };
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const title =
    getVocDisplayTitle({
      voc_type: entry.voc_type,
      title: entry.ticket_name,
    }) || entry.ticket_name;

  const images = [
    ...(entry.document_url && isPreviewableImage(entry.document_url)
      ? [{ url: entry.document_url, alt: `${title} (front)` }]
      : []),
    ...(entry.document_url_back && isPreviewableImage(entry.document_url_back)
      ? [{ url: entry.document_url_back, alt: `${title} (back)` }]
      : []),
  ];

  return (
    <div className={cn(cardClass, "flex flex-wrap items-start justify-between gap-3 p-4")}>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onEdit}
          className="text-left"
        >
          <p className="font-semibold text-slate-900 hover:text-orange-700">
            {title}
          </p>
        </button>
        {entry.ticket_number ? (
          <p className="text-sm text-slate-500">No. {entry.ticket_number}</p>
        ) : null}
        <p className="mt-1 text-xs text-slate-500">
          {requiresExpiry
            ? `Issued: ${entry.issue_date ?? "—"} · Expires: ${entry.expiry_date ?? "—"}`
            : `Issued: ${entry.issue_date ?? "—"} · No expiry required`}
        </p>

        {images.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {images.map((image, index) => (
              <button
                key={image.url}
                type="button"
                onClick={() => setLightboxIndex(index)}
                className="group relative h-14 w-14 overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                aria-label={`Preview ${image.alt}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt={image.alt}
                  className="h-full w-full object-cover"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/35">
                  <ZoomIn className="h-4 w-4 text-white opacity-0 transition group-hover:opacity-100" />
                </span>
              </button>
            ))}
          </div>
        ) : entry.document_url ? (
          <a
            href={entry.document_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-orange-600 hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> View document
          </a>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded px-2 py-0.5 text-xs font-bold", badgeStyles[status])}>
          {requiresExpiry ? getTicketBadgeLabel(status) : "On File"}
        </span>
        <button
          type="button"
          onClick={() => {
            if (canEdit) {
              onEdit();
              return;
            }
            if (images.length > 0) {
              setLightboxIndex(0);
            }
          }}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:border-orange-300"
        >
          <Pencil className="h-3 w-3" /> {canEdit ? "Edit" : "View"}
        </button>
        {canEdit ? (
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        ) : null}
      </div>

      {lightboxIndex !== null && images.length > 0 ? (
        <ImageLightboxGallery
          images={images}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </div>
  );
}

export default function WorkerCardsVocsEditor({
  workerId,
  entries,
  onChange,
  canEdit = true,
}: WorkerCardsVocsEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const updateEntry = (updated: WorkerCardVocEntry) => {
    const next =
      updated.category === "white_card"
        ? { ...updated, expiry_date: null }
        : updated;
    onChange(entries.map((row) => (row.id === next.id ? next : row)));
  };

  const removeEntry = (id: string) => {
    onChange(entries.filter((row) => row.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const addEntry = (category: WorkerCardCategory) => {
    if (!canEdit) return;
    const next = createEmptyCardVocEntry(category);
    onChange([...entries, next]);
    setEditingId(next.id);
  };

  return (
    <div className="space-y-8">
      {WORKER_CARD_CATEGORIES.map((category) => {
        const categoryEntries = entries.filter((entry) => entry.category === category);
        return (
          <section key={category} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">
                {WORKER_CARD_CATEGORY_LABELS[category]}
              </h3>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => addEntry(category)}
                  className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-800 hover:bg-orange-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add entry
                </button>
              ) : null}
            </div>

            {categoryEntries.length === 0 ? (
              <p className={`p-4 text-sm text-slate-500 ${cardClass}`}>
                No {WORKER_CARD_CATEGORY_LABELS[category].toLowerCase()} on file.
              </p>
            ) : (
              <div className="space-y-3">
                {categoryEntries.map((entry) =>
                  editingId === entry.id && canEdit ? (
                    <EntryForm
                      key={entry.id}
                      entry={entry}
                      workerId={workerId}
                      onChange={updateEntry}
                      onDone={() => setEditingId(null)}
                      onDelete={() => removeEntry(entry.id)}
                    />
                  ) : (
                    <EntrySummary
                      key={entry.id}
                      entry={entry}
                      canEdit={canEdit}
                      onEdit={() => setEditingId(entry.id)}
                      onDelete={() => removeEntry(entry.id)}
                    />
                  )
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
