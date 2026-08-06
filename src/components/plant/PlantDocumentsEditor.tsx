"use client";

import { useState } from "react";
import { ExternalLink, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  PLANT_DOCUMENT_CATEGORIES,
  PLANT_DOCUMENT_CATEGORY_LABELS,
  createEmptyPlantDocument,
  type PlantDocumentCategory,
  type PlantDocumentRecord,
} from "@/lib/plant-documents";
import { uploadPlantFileSafe } from "@/lib/plant-doc-upload";
import { getInsuranceExpiryStatus } from "@/lib/insurance-utils";
import { cn } from "@/lib/utils";
import { cardClass, inputClass, labelClass, sectionClass } from "@/lib/ui-classes";

interface PlantDocumentsEditorProps {
  plantId: string;
  documents: PlantDocumentRecord[];
  onChange: (documents: PlantDocumentRecord[]) => void;
}

function DocumentForm({
  document,
  plantId,
  onChange,
  onDone,
  onDelete,
}: {
  document: PlantDocumentRecord;
  plantId: string;
  onChange: (document: PlantDocumentRecord) => void;
  onDone: () => void;
  onDelete: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const handleFile = async (file: File | null) => {
    if (!file) {
      setPendingFile(null);
      return;
    }
    setPendingFile(file);
    setUploading(true);
    const url = await uploadPlantFileSafe(
      file,
      `plant/${plantId}/documents/${document.id}/${Date.now()}`
    );
    setUploading(false);
    if (url) {
      onChange({
        ...document,
        file_url: url,
        uploaded_at: new Date().toISOString(),
      });
      setPendingFile(null);
    }
  };

  return (
    <div className={cn(sectionClass, "space-y-3")}>
      <label className="block space-y-1">
        <span className={labelClass}>Document name</span>
        <input
          className={inputClass}
          value={document.name}
          onChange={(e) => onChange({ ...document, name: e.target.value })}
        />
      </label>
      <label className="block space-y-1">
        <span className={labelClass}>Expiry date (optional)</span>
        <input
          type="date"
          className={inputClass}
          value={document.expiry_date ?? ""}
          onChange={(e) =>
            onChange({ ...document, expiry_date: e.target.value || null })
          }
        />
      </label>
      <label className="block space-y-1">
        <span className={labelClass}>File</span>
        <input
          type="file"
          className={inputClass}
          onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
        />
        {uploading && (
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
          </p>
        )}
        {document.file_url ? (
          <a
            href={document.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> View current file
          </a>
        ) : null}
      </label>
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

function DocumentSummary({
  document,
  onEdit,
  onDelete,
}: {
  document: PlantDocumentRecord;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const expiry = getInsuranceExpiryStatus(document.expiry_date);

  return (
    <div className={cn(cardClass, "flex flex-wrap items-start justify-between gap-3 p-4")}>
      <div>
        <p className="font-semibold text-slate-900">{document.name || "Untitled document"}</p>
        <p className="text-xs text-slate-500">
          Uploaded {new Date(document.uploaded_at).toLocaleDateString("en-AU")}
        </p>
        {document.expiry_date ? (
          <p className="text-xs text-slate-500">Expires {document.expiry_date}</p>
        ) : null}
        {document.file_url ? (
          <a
            href={document.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-orange-600 hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> Download
          </a>
        ) : (
          <p className="mt-1 text-xs text-slate-400">No file attached</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {document.expiry_date ? (
          <span className={cn("rounded px-2 py-0.5 text-xs font-bold", expiry.badgeClass)}>
            {expiry.label}
          </span>
        ) : null}
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

export default function PlantDocumentsEditor({
  plantId,
  documents,
  onChange,
}: PlantDocumentsEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const updateDocument = (updated: PlantDocumentRecord) => {
    onChange(documents.map((row) => (row.id === updated.id ? updated : row)));
  };

  const removeDocument = (id: string) => {
    onChange(documents.filter((row) => row.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const addDocument = (category: PlantDocumentCategory) => {
    const next = createEmptyPlantDocument(category);
    onChange([...documents, next]);
    setEditingId(next.id);
  };

  return (
    <div className="space-y-8">
      {PLANT_DOCUMENT_CATEGORIES.map((category) => {
        const categoryDocs = documents.filter((doc) => doc.category === category);
        return (
          <section key={category} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">
                {PLANT_DOCUMENT_CATEGORY_LABELS[category]}
              </h3>
              <button
                type="button"
                onClick={() => addDocument(category)}
                className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-800 hover:bg-orange-100"
              >
                <Plus className="h-3.5 w-3.5" />
                Add document
              </button>
            </div>

            {categoryDocs.length === 0 ? (
              <p className={`p-4 text-sm text-slate-500 ${cardClass}`}>
                No documents in this section yet.
              </p>
            ) : (
              <div className="space-y-3">
                {categoryDocs.map((doc) =>
                  editingId === doc.id ? (
                    <DocumentForm
                      key={doc.id}
                      document={doc}
                      plantId={plantId}
                      onChange={updateDocument}
                      onDone={() => setEditingId(null)}
                      onDelete={() => removeDocument(doc.id)}
                    />
                  ) : (
                    <DocumentSummary
                      key={doc.id}
                      document={doc}
                      onEdit={() => setEditingId(doc.id)}
                      onDelete={() => removeDocument(doc.id)}
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
