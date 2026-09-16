"use client";

import { useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  createItcFromPin,
  nearestZoneForPin,
  type CreateItcFromPinInput,
  type FieldDrawing,
  type FieldFormVersion,
  type FieldItcListResult,
  type FieldItcRecord,
} from "@/lib/api/itc";
import {
  inputClass,
  labelClass,
  modalBodyClass,
  modalCloseIconButtonClass,
  modalOverlayClass,
  modalShellClass,
  modalStickyFooterClass,
} from "@/lib/ui-classes";

interface FieldItcCreateModalProps {
  projectId: string;
  pinX: number;
  pinY: number;
  planUrl: string | null;
  data: FieldItcListResult;
  drawings: FieldDrawing[];
  formVersions: FieldFormVersion[];
  activeServiceId: string;
  activeDrawingId: string;
  activeFormVersionId: string;
  onClose: () => void;
  onCreated: (itc: FieldItcRecord) => void;
}

export default function FieldItcCreateModal({
  projectId,
  pinX,
  pinY,
  planUrl,
  data,
  drawings,
  formVersions,
  activeServiceId,
  activeDrawingId,
  activeFormVersionId,
  onClose,
  onCreated,
}: FieldItcCreateModalProps) {
  const nearest = useMemo(
    () => nearestZoneForPin(data.zones, pinX, pinY),
    [data.zones, pinX, pinY]
  );
  const [zoneId, setZoneId] = useState(nearest?.id ?? data.zones[0]?.id ?? "");
  const [serviceId, setServiceId] = useState(
    activeServiceId || data.services[0]?.id || ""
  );
  const [drawingId, setDrawingId] = useState(
    activeDrawingId || drawings[0]?.id || ""
  );
  const [formVersionId, setFormVersionId] = useState(
    activeFormVersionId || formVersions.find((row) => row.is_current)?.id || formVersions[0]?.id || ""
  );
  const [endA, setEndA] = useState("");
  const [endB, setEndB] = useState("");
  const [lengthM, setLengthM] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedZone = data.zones.find((zone) => zone.id === zoneId) ?? nearest;
  const selectedService =
    data.services.find((service) => service.id === serviceId) ?? data.services[0];
  const selectedDrawing =
    drawings.find((drawing) => drawing.id === drawingId) ?? drawings[0] ?? null;

  const handleSubmit = async () => {
    if (!endA.trim() || !endB.trim()) {
      setMessage("Enter run endpoints (End A → End B).");
      return;
    }
    setSaving(true);
    setMessage(null);
    const payload: CreateItcFromPinInput = {
      projectId,
      pinX,
      pinY,
      zoneId: selectedZone?.id ?? null,
      zoneCode: selectedZone?.code ?? null,
      serviceId: selectedService?.id ?? null,
      serviceCode: selectedService?.code ?? null,
      serviceName: selectedService?.name ?? null,
      drawingRev: selectedDrawing?.current_rev ?? selectedDrawing?.title ?? null,
      formVersionId: formVersionId || null,
      endA,
      endB,
      lengthM: lengthM ? Number(lengthM) : null,
    };
    const result = await createItcFromPin(payload);
    setSaving(false);
    if (result.error || !result.itc) {
      setMessage(result.error ?? "Could not create ITC.");
      return;
    }
    onCreated(result.itc);
  };

  return (
    <div className={modalOverlayClass}>
      <div className={`${modalShellClass} max-w-2xl`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Create ITC</h2>
            <p className="text-xs text-slate-500">
              Pin {(pinX * 100).toFixed(1)}% × {(pinY * 100).toFixed(1)}% ·{" "}
              {selectedService?.name ?? "Service"} / {selectedZone?.name ?? "Zone"}
            </p>
          </div>
          <button type="button" onClick={onClose} className={modalCloseIconButtonClass}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className={modalBodyClass}>
          <div className="mb-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            <div className="relative aspect-video">
              {planUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={planUrl} alt="Plan preview" className="h-full w-full object-contain" />
              ) : (
                <div className="h-full w-full bg-[linear-gradient(rgba(148,163,184,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.2)_1px,transparent_1px)] bg-[size:24px_24px]" />
              )}
              <span
                className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-orange-500 shadow"
                style={{ left: `${pinX * 100}%`, top: `${pinY * 100}%` }}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className={labelClass}>Zone</span>
              <select
                value={zoneId}
                onChange={(event) => setZoneId(event.target.value)}
                className={inputClass}
              >
                {data.zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={labelClass}>Service</span>
              <select
                value={serviceId}
                onChange={(event) => setServiceId(event.target.value)}
                className={inputClass}
              >
                {data.services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={labelClass}>Drawing reference</span>
              <select
                value={drawingId}
                onChange={(event) => setDrawingId(event.target.value)}
                className={inputClass}
              >
                {drawings.length === 0 ? <option value="">No drawings</option> : null}
                {drawings.map((drawing) => (
                  <option key={drawing.id} value={drawing.id}>
                    {drawing.title}
                    {drawing.current_rev ? ` · rev ${drawing.current_rev}` : ""}
                  </option>
                ))}
              </select>
            </label>
            {formVersions.length ? (
              <label>
                <span className={labelClass}>Form version (ITP)</span>
                <select
                  value={formVersionId}
                  onChange={(event) => setFormVersionId(event.target.value)}
                  className={inputClass}
                >
                  {formVersions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {version.name}
                      {version.is_current ? " (current)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label>
              <span className={labelClass}>End A (e.g. Pit A1)</span>
              <input
                value={endA}
                onChange={(event) => setEndA(event.target.value)}
                className={inputClass}
                placeholder="Pit A1"
                required
              />
            </label>
            <label>
              <span className={labelClass}>End B (e.g. Chamber B2)</span>
              <input
                value={endB}
                onChange={(event) => setEndB(event.target.value)}
                className={inputClass}
                placeholder="Chamber B2"
                required
              />
            </label>
            <label className="sm:col-span-2">
              <span className={labelClass}>Run length (m)</span>
              <input
                type="number"
                value={lengthM}
                onChange={(event) => setLengthM(event.target.value)}
                className={inputClass}
                placeholder="Length of run"
              />
            </label>
          </div>
          {message ? <p className="mt-3 text-sm text-red-600">{message}</p> : null}
        </div>
        <div className={`${modalStickyFooterClass} flex justify-end gap-2 pb-3`}>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSubmit()}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create ITC
          </button>
        </div>
      </div>
    </div>
  );
}
