"use client";

import { ITC_SERVICE_TYPES } from "@/lib/itc-batch-templates";
import { inputClass, modalClass, modalOverlayClass } from "@/lib/ui-classes";

interface ItcPinQuickModalProps {
  onClose: () => void;
  onSave: (input: {
    serviceType: string;
    upstreamPitNumber: string;
    downstreamPitNumber: string;
  }) => void;
}

export default function ItcPinQuickModal({ onClose, onSave }: ItcPinQuickModalProps) {
  return (
    <div className={modalOverlayClass}>
      <div className={modalClass}>
        <h2 className="text-lg font-bold text-slate-900">Set Pin Details</h2>
        <p className="mt-1 text-sm text-slate-500">
          Configure the service run for this dropped pin.
        </p>

        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            onSave({
              serviceType: String(data.get("serviceType") ?? "LV"),
              upstreamPitNumber: String(data.get("upstreamPitNumber") ?? "").trim(),
              downstreamPitNumber: String(data.get("downstreamPitNumber") ?? "").trim(),
            });
          }}
        >
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Service Type
            </span>
            <select name="serviceType" defaultValue="LV" className={inputClass}>
              {ITC_SERVICE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Upstream Pit #
            </span>
            <input name="upstreamPitNumber" className={inputClass} placeholder="Pit 12" required />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Downstream Pit #
            </span>
            <input name="downstreamPitNumber" className={inputClass} placeholder="Pit 13" required />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Add Pin
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
