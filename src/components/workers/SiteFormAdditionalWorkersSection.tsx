"use client";

import { Plus, Trash2 } from "lucide-react";
import SignatureCanvas from "@/components/prestart/SignatureCanvas";
import { inputClass, labelClass, sectionClass } from "@/lib/ui-classes";

export interface AdditionalWorkerDraft {
  id: string;
  name: string;
  signatureDataUrl: string | null;
}

interface SiteFormAdditionalWorkersSectionProps {
  workers: AdditionalWorkerDraft[];
  onChange: (workers: AdditionalWorkerDraft[]) => void;
}

function createAdditionalWorkerRow(): AdditionalWorkerDraft {
  return {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `additional-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    signatureDataUrl: null,
  };
}

export default function SiteFormAdditionalWorkersSection({
  workers,
  onChange,
}: SiteFormAdditionalWorkersSectionProps) {
  const addRow = () => {
    onChange([...workers, createAdditionalWorkerRow()]);
  };

  const removeRow = (id: string) => {
    onChange(workers.filter((row) => row.id !== id));
  };

  const updateName = (id: string, name: string) => {
    onChange(workers.map((row) => (row.id === id ? { ...row, name } : row)));
  };

  const updateSignature = (id: string, signatureDataUrl: string | null) => {
    onChange(
      workers.map((row) =>
        row.id === id ? { ...row, signatureDataUrl } : row
      )
    );
  };

  return (
    <div className={sectionClass}>
      <div className="mb-3">
        <p className="text-sm font-semibold text-slate-900">
          Additional Workers / Late Sign-ons
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          Add workers who joined after the main attendance roll with their name and
          signature.
        </p>
      </div>

      {workers.length === 0 ? (
        <p className="mb-3 text-sm text-slate-500">
          No additional workers added yet.
        </p>
      ) : (
        <div className="space-y-4">
          {workers.map((row, index) => (
            <div
              key={row.id}
              className="rounded-lg border border-slate-200 bg-white p-3"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Additional worker {index + 1}
                </p>
                <button
                  type="button"
                  onClick={() => removeRow(row.id)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </button>
              </div>

              <label className="block space-y-1">
                <span className={labelClass}>Worker full name *</span>
                <input
                  className={inputClass}
                  value={row.name}
                  onChange={(e) => updateName(row.id, e.target.value)}
                  placeholder="Full name"
                />
              </label>

              <div className="mt-3">
                <p className="mb-1 text-xs text-slate-500">Worker signature *</p>
                <SignatureCanvas
                  key={row.id}
                  onChange={(signature) => updateSignature(row.id, signature)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={addRow}
        className="mt-3 inline-flex items-center gap-2 rounded-lg border border-dashed border-orange-300 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100"
      >
        <Plus className="h-4 w-4" />
        Add Additional Worker
      </button>
    </div>
  );
}
