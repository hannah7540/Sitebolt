"use client";

import { Plus, Trash2 } from "lucide-react";
import {
  VOC_TYPE_OPTIONS,
  createEmptyVoc,
  getVocDisplayTitle,
  type VocDraft,
} from "@/lib/voc-utils";
import { cn } from "@/lib/utils";
import { inputClass, sectionClass, labelClass } from "@/lib/ui-classes";
import DocumentCapture from "@/components/ui/DocumentCapture";

interface VocListEditorProps {
  vocs: VocDraft[];
  onChange: (vocs: VocDraft[]) => void;
  minItems?: number;
  /** Prefix for immediate worker-docs uploads, e.g. workers/{id}/vocs */
  uploadPathPrefix?: string;
}

function Field({
  label,
  children,
  required = false,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block space-y-1">
      <span className={labelClass}>
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}

export default function VocListEditor({
  vocs,
  onChange,
  minItems = 0,
  uploadPathPrefix,
}: VocListEditorProps) {
  const updateVoc = (clientId: string, patch: Partial<VocDraft>) => {
    onChange(
      vocs.map((v) => (v.clientId === clientId ? { ...v, ...patch } : v))
    );
  };

  const removeVoc = (clientId: string) => {
    if (vocs.length <= minItems) return;
    onChange(vocs.filter((v) => v.clientId !== clientId));
  };

  const addVoc = () => {
    onChange([...vocs, createEmptyVoc()]);
  };

  return (
    <div className="space-y-4">
      {vocs.map((voc, index) => {
        const displayTitle = getVocDisplayTitle(voc);
        return (
          <div key={voc.clientId} className={sectionClass}>
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-orange-600">
                VOC {index + 1}
                {displayTitle ? `: ${displayTitle}` : ""}
              </h4>
              {vocs.length > minItems && (
                <button
                  type="button"
                  onClick={() => removeVoc(voc.clientId)}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              )}
            </div>

            <Field label="VOC Type" required>
              <select
                className={inputClass}
                value={voc.voc_type}
                required
                onChange={(e) => {
                  const vocType = e.target.value;
                  updateVoc(voc.clientId, { voc_type: vocType, title: vocType });
                }}
              >
                <option value="">Select VOC type…</option>
                {VOC_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Issuing Organisation">
              <input
                className={inputClass}
                value={voc.issuing_org}
                onChange={(e) =>
                  updateVoc(voc.clientId, { issuing_org: e.target.value })
                }
              />
            </Field>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Issue Date">
                <input
                  type="date"
                  className={inputClass}
                  value={voc.issue_date ?? ""}
                  onChange={(e) =>
                    updateVoc(voc.clientId, { issue_date: e.target.value })
                  }
                />
              </Field>
              <Field label="Expiry Date">
                <input
                  type="date"
                  className={inputClass}
                  value={voc.expiry_date ?? ""}
                  onChange={(e) =>
                    updateVoc(voc.clientId, { expiry_date: e.target.value })
                  }
                />
              </Field>
            </div>

            <DocumentCapture
              label="Photo / Document"
              file={voc.file}
              onFileChange={(file) => updateVoc(voc.clientId, { file })}
              existingUrl={voc.document_url}
              uploadedUrl={voc.document_url}
              uploadPath={
                uploadPathPrefix
                  ? `${uploadPathPrefix}/${index}-${displayTitle.replace(/[^a-z0-9]/gi, "_") || "voc"}`
                  : undefined
              }
              onUploaded={(url) => updateVoc(voc.clientId, { document_url: url })}
            />
          </div>
        );
      })}

      <button
        type="button"
        onClick={addVoc}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-orange-500/50",
          "bg-orange-500/5 px-4 py-3 text-sm font-semibold text-orange-600",
          "transition hover:border-orange-500 hover:bg-orange-500/10"
        )}
      >
        <Plus className="h-4 w-4" /> Add Another VOC
      </button>
    </div>
  );
}
