"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { bulkCreateItcs, type ItcZone } from "@/lib/itc-service";
import type { ItcConduitConfig } from "@/lib/itc-templates";
import { inputClass, modalClass, modalOverlayClass } from "@/lib/ui-classes";

interface ItcBulkCreateModalProps {
  projectId: string;
  zones: ItcZone[];
  onClose: () => void;
  onCreated: () => void;
}

export default function ItcBulkCreateModal({
  projectId,
  zones,
  onClose,
  onCreated,
}: ItcBulkCreateModalProps) {
  const [zoneCode, setZoneCode] = useState(zones[0]?.zone_code ?? "MP0");
  const [building, setBuilding] = useState("");
  const [serviceDiscipline, setServiceDiscipline] = useState("Electrical LV");
  const [startHub, setStartHub] = useState("Hub A");
  const [endHub, setEndHub] = useState("Node B");
  const [pitPrefix, setPitPrefix] = useState("Pit");
  const [startPit, setStartPit] = useState(1);
  const [endPit, setEndPit] = useState(5);
  const [conduitCount, setConduitCount] = useState(4);
  const [conduitSize, setConduitSize] = useState("100mm");
  const [lengthM, setLengthM] = useState("85");
  const [trenchGroup, setTrenchGroup] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const conduits: ItcConduitConfig[] = [{ n: conduitCount, size: conduitSize }];
    const result = await bulkCreateItcs({
      projectId,
      zoneCode,
      building,
      serviceDiscipline,
      startHub,
      endHub,
      pitPrefix,
      startPit,
      endPit,
      conduits,
      lengthM: Number(lengthM) || undefined,
      trenchGroup: trenchGroup || `T-${zoneCode}`,
    });

    setLoading(false);
    if (result.error) {
      setMessage(result.error);
      return;
    }

    setMessage(`Created ${result.created} ITC(s).`);
    onCreated();
    onClose();
  };

  return (
    <div className={modalOverlayClass}>
      <div className={modalClass}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Bulk Create ITCs</h2>
            <p className="text-sm text-slate-500">
              Generate a run from hub/node pairs or consecutive pit numbers.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Zone</span>
            <select value={zoneCode} onChange={(e) => setZoneCode(e.target.value)} className={inputClass}>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.zone_code}>
                  {zone.zone_name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Building</span>
            <input value={building} onChange={(e) => setBuilding(e.target.value)} className={inputClass} />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Discipline</span>
            <input
              value={serviceDiscipline}
              onChange={(e) => setServiceDiscipline(e.target.value)}
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Start Hub / Node</span>
            <input value={startHub} onChange={(e) => setStartHub(e.target.value)} className={inputClass} required />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">End Hub / Node</span>
            <input value={endHub} onChange={(e) => setEndHub(e.target.value)} className={inputClass} required />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Pit Prefix</span>
            <input value={pitPrefix} onChange={(e) => setPitPrefix(e.target.value)} className={inputClass} />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Trench Group</span>
            <input
              value={trenchGroup}
              onChange={(e) => setTrenchGroup(e.target.value)}
              placeholder={`T-${zoneCode}`}
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Start Pit #</span>
            <input
              type="number"
              min={1}
              value={startPit}
              onChange={(e) => setStartPit(Number(e.target.value))}
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">End Pit #</span>
            <input
              type="number"
              min={startPit}
              value={endPit}
              onChange={(e) => setEndPit(Number(e.target.value))}
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Conduit Count</span>
            <input
              type="number"
              min={1}
              value={conduitCount}
              onChange={(e) => setConduitCount(Number(e.target.value))}
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Conduit Size</span>
            <input value={conduitSize} onChange={(e) => setConduitSize(e.target.value)} className={inputClass} />
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Length (m)</span>
            <input value={lengthM} onChange={(e) => setLengthM(e.target.value)} className={inputClass} />
          </label>

          {message ? (
            <p className="sm:col-span-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</p>
          ) : null}

          <div className="flex justify-end gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Generate Run
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
