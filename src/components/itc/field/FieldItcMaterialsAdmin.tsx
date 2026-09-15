"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import {
  defaultPipeDimensionSpecs,
  listPipeDimensionSpecs,
  savePipeDimensionSpecs,
} from "@/lib/api/itc";
import type { ElectricalConduitSpecEntry } from "@/lib/itc-electrical-conduit-specs";
import { cardClass, inputClass } from "@/lib/ui-classes";

export default function FieldItcMaterialsAdmin() {
  const [rows, setRows] = useState<ElectricalConduitSpecEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const specs = await listPipeDimensionSpecs();
      if (!cancelled) {
        setRows(specs);
        setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateRow = (index: number, patch: Partial<ElectricalConduitSpecEntry>) => {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    const result = await savePipeDimensionSpecs(rows);
    setSaving(false);
    setMessage(result.error ?? "Pipe dimension specs saved.");
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
        Loading material dimensions…
      </div>
    );
  }

  return (
    <div className={`${cardClass} overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Materials dimension admin</h2>
          <p className="text-xs text-slate-500">
            Pipe / conduit trench dimensions used by ITC auto-fill (HV, LV, Comms).
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setRows(defaultPipeDimensionSpecs())}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
          >
            Reset defaults
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save specs
          </button>
        </div>
      </div>
      {message ? <p className="px-4 pt-3 text-sm text-slate-600">{message}</p> : null}
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 text-left uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">DN</th>
              <th className="px-3 py-2">Material</th>
              <th className="px-3 py-2">H sep</th>
              <th className="px-3 py-2">V sep</th>
              <th className="px-3 py-2">Bedding</th>
              <th className="px-3 py-2">Side</th>
              <th className="px-3 py-2">Overlay</th>
              <th className="px-3 py-2">Cover</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.category}-${row.diameter_mm}-${index}`} className="border-t border-slate-100">
                <td className="px-3 py-2 font-semibold">{row.category}</td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    value={row.diameter_mm}
                    onChange={(event) =>
                      updateRow(index, { diameter_mm: Number(event.target.value) })
                    }
                    className={inputClass}
                  />
                </td>
                <td className="min-w-[180px] px-3 py-2">
                  <input
                    value={row.material_and_size}
                    onChange={(event) =>
                      updateRow(index, { material_and_size: event.target.value })
                    }
                    className={inputClass}
                  />
                </td>
                {(
                  [
                    "min_horizontal_sep_mm",
                    "min_vertical_sep_mm",
                    "min_bedding_mm",
                    "min_side_mm",
                    "min_overlay_mm",
                    "min_cover_mm",
                  ] as const
                ).map((key) => (
                  <td key={key} className="px-3 py-2">
                    <input
                      type="number"
                      value={row[key]}
                      onChange={(event) =>
                        updateRow(index, { [key]: Number(event.target.value) })
                      }
                      className={inputClass}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
