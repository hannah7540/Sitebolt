"use client";

import { useState } from "react";
import { ExternalLink, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  WORKER_CARD_CATEGORIES,
  WORKER_CARD_CATEGORY_LABELS,
  createEmptyCardVocEntry,
  type WorkerCardCategory,
  type WorkerCardVocEntry,
} from "@/lib/worker-cards-vocs";
import { VOC_TYPE_OPTIONS, getVocDisplayTitle } from "@/lib/voc-utils";
import { getTicketStatus } from "@/lib/worker-utils";
import { getTicketBadgeLabel } from "@/lib/worker-compliance";
import { uploadWorkerDocumentSafe } from "@/lib/worker-doc-upload";
import DocumentCapture from "@/components/ui/DocumentCapture";
import { cn } from "@/lib/utils";
import { cardClass, inputClass, labelClass, sectionClass } from "@/lib/ui-classes";

interface WorkerCardsVocsEditorProps {
  workerId: string;
  entries: WorkerCardVocEntry[];
  onChange: (entries: WorkerCardVocEntry[]) => void;
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
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const handleUpload = async (file: File | null) => {
    if (!file) {
      setPendingFile(null);
      return;
    }
    setPendingFile(file);
    setUploading(true);
    const url = await uploadWorkerDocumentSafe(
      file,
      `workers/${workerId}/cards-vocs/${entry.id}/${Date.now()}`
    );
    setUploading(false);
    if (url) {
      onChange({ ...entry, document_url: url });
      setPendingFile(null);
    }
  };

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
      </div>
      <DocumentCapture
        label="Document attachment"
        file={pendingFile}
        onFileChange={(file) => void handleUpload(file)}
        existingUrl={entry.document_url}
        uploadedUrl={entry.document_url}
        disabled={uploading}
      />
      {uploading && (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading document…
        </p>
      )}
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
}: {
  entry: WorkerCardVocEntry;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const status = getTicketStatus(entry.expiry_date);
  const badgeStyles = {
    valid: "bg-emerald-100 text-emerald-800",
    expires_soon: "bg-amber-100 text-amber-800",
    expired: "bg-red-100 text-red-800",
    unknown: "bg-slate-100 text-slate-600",
  };

  return (
    <div className={cn(cardClass, "flex flex-wrap items-start justify-between gap-3 p-4")}>
      <div>
        <p className="font-semibold text-slate-900">
          {getVocDisplayTitle({
            voc_type: entry.voc_type,
            title: entry.ticket_name,
          }) || entry.ticket_name}
        </p>
        {entry.ticket_number ? (
          <p className="text-sm text-slate-500">No. {entry.ticket_number}</p>
        ) : null}
        <p className="mt-1 text-xs text-slate-500">
          Issued: {entry.issue_date ?? "—"} · Expires: {entry.expiry_date ?? "—"}
        </p>
        {entry.document_url ? (
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
          {getTicketBadgeLabel(status)}
        </span>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:border-orange-300"
        >
          <Pencil className="h-3 w-3" /> Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-3 w-3" /> Delete
        </button>
      </div>
    </div>
  );
}

export default function WorkerCardsVocsEditor({
  workerId,
  entries,
  onChange,
}: WorkerCardsVocsEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const updateEntry = (updated: WorkerCardVocEntry) => {
    onChange(entries.map((row) => (row.id === updated.id ? updated : row)));
  };

  const removeEntry = (id: string) => {
    onChange(entries.filter((row) => row.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const addEntry = (category: WorkerCardCategory) => {
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
              <button
                type="button"
                onClick={() => addEntry(category)}
                className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-800 hover:bg-orange-100"
              >
                <Plus className="h-3.5 w-3.5" />
                Add entry
              </button>
            </div>

            {categoryEntries.length === 0 ? (
              <p className={`p-4 text-sm text-slate-500 ${cardClass}`}>
                No {WORKER_CARD_CATEGORY_LABELS[category].toLowerCase()} on file.
              </p>
            ) : (
              <div className="space-y-3">
                {categoryEntries.map((entry) =>
                  editingId === entry.id ? (
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
