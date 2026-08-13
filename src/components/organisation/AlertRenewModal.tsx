"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { ComplianceAlertItem } from "@/lib/compliance-alerts-hub";
import { renewComplianceAlert } from "@/lib/compliance-alerts-hub";
import { uploadFleetDocument } from "@/lib/fleet-upload";
import { uploadPlantFileSafe } from "@/lib/plant-doc-upload";
import { uploadWorkerDocumentSafe } from "@/lib/worker-doc-upload";
import { cn } from "@/lib/utils";
import { inputClass, labelClass, modalClass, modalOverlayClass } from "@/lib/ui-classes";

interface AlertRenewModalProps {
  alert: ComplianceAlertItem;
  onClose: () => void;
  onSaved: () => void;
}

export default function AlertRenewModal({ alert, onClose, onSaved }: AlertRenewModalProps) {
  const isHeavyVehicle = alert.category === "heavy_vehicle_check";
  const [expiryDate, setExpiryDate] = useState(alert.expiryDate);
  const [lastCheckDate, setLastCheckDate] = useState(
    String(alert.metadata.lastCheckDate ?? new Date().toISOString().slice(0, 10))
  );
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setExpiryDate(alert.expiryDate);
    setLastCheckDate(
      String(alert.metadata.lastCheckDate ?? new Date().toISOString().slice(0, 10))
    );
    setFile(null);
    setError(null);
  }, [alert]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!expiryDate.trim()) {
      setError("Please enter the new expiry or due date.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let documentUrl: string | null | undefined;

      if (file) {
        if (alert.sourceType === "fleet") {
          const documentType = String(alert.metadata.documentType ?? "rego") as
            | "rego"
            | "insurance";
          const upload = await uploadFleetDocument(file, alert.sourceId, documentType);
          if (upload.error) {
            setError(upload.error);
            setSaving(false);
            return;
          }
          documentUrl = upload.url ?? undefined;
        } else if (alert.sourceType === "worker") {
          documentUrl = await uploadWorkerDocumentSafe(
            file,
            `workers/${alert.sourceId}/alerts/${alert.id}-${Date.now()}`
          );
        } else if (alert.sourceType === "plant") {
          documentUrl = await uploadPlantFileSafe(
            file,
            `plant/${alert.sourceId}/alerts/${alert.id}-${Date.now()}`
          );
        }
      }

      const result = await renewComplianceAlert({
        alert,
        expiryDate: expiryDate.trim(),
        lastCheckDate: isHeavyVehicle ? lastCheckDate.trim() || null : null,
        documentUrl,
      });

      if (result.error) {
        setError(result.error);
        setSaving(false);
        return;
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save renewal.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={modalOverlayClass}>
      <form onSubmit={handleSubmit} className={cn(modalClass, "max-w-lg")}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Update / Renew</h2>
            <p className="mt-1 text-sm text-slate-500">
              {alert.title} · {alert.documentLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isHeavyVehicle ? (
          <label className="mb-4 block">
            <span className={labelClass}>Last inspection date</span>
            <input
              type="date"
              value={lastCheckDate}
              onChange={(event) => setLastCheckDate(event.target.value)}
              className={inputClass}
            />
          </label>
        ) : null}

        <label className="mb-4 block">
          <span className={labelClass}>
            {isHeavyVehicle ? "Next due date" : "New expiry date"}
          </span>
          <input
            type="date"
            required
            value={expiryDate}
            onChange={(event) => setExpiryDate(event.target.value)}
            className={inputClass}
          />
        </label>

        <label className="mb-4 block">
          <span className={labelClass}>Renewal certificate / document (optional)</span>
          <input
            type="file"
            accept=".pdf,image/*"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-600"
          />
        </label>

        {error ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save &amp; Clear Alert
          </button>
        </div>
      </form>
    </div>
  );
}
