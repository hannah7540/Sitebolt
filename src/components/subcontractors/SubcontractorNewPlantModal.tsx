"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { createSubcontractorPortalPlant } from "@/lib/subcontractor-portal-resources";
import {
  inputClass,
  labelClass,
  modalClass,
  modalOverlayClass,
} from "@/lib/ui-classes";

export default function SubcontractorNewPlantModal({
  subcontractorId,
  organisationId,
  onClose,
  onSaved,
}: {
  subcontractorId: string;
  organisationId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [nextServiceDate, setNextServiceDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const result = await createSubcontractorPortalPlant({
      subcontractorId,
      organisationId,
      name,
      make,
      model,
      serialNumber,
      nextServiceDate,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved();
  };

  return (
    <div className={modalOverlayClass}>
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className={`${modalClass} max-w-lg space-y-4`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-500">
              Plant
            </p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">New Plant</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="block space-y-1">
          <span className={labelClass}>Name / Type *</span>
          <input
            className={inputClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className={labelClass}>Make *</span>
            <input
              className={inputClass}
              value={make}
              onChange={(event) => setMake(event.target.value)}
              required
            />
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>Model *</span>
            <input
              className={inputClass}
              value={model}
              onChange={(event) => setModel(event.target.value)}
              required
            />
          </label>
        </div>
        <label className="block space-y-1">
          <span className={labelClass}>Serial / Rego *</span>
          <input
            className={inputClass}
            value={serialNumber}
            onChange={(event) => setSerialNumber(event.target.value)}
            required
          />
        </label>
        <label className="block space-y-1">
          <span className={labelClass}>Next service date *</span>
          <input
            className={inputClass}
            type="date"
            value={nextServiceDate}
            onChange={(event) => setNextServiceDate(event.target.value)}
            required
          />
        </label>

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Add plant
          </button>
        </div>
      </form>
    </div>
  );
}
