"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import {
  fetchItcMasterSpecs,
  saveItcMasterSpec,
  type ItcMasterSpec,
  type ItcTradeDiscipline,
} from "@/lib/itc-master-spec-service";
import { uploadItcMarkup } from "@/lib/itc-upload";
import { cardClass, inputClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface ItcMasterSpecPanelProps {
  projectId: string;
}

const DISCIPLINES: ItcTradeDiscipline[] = ["Electrical", "Drainage", "Hydraulics"];

function linesToArray(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function arrayToLines(values: string[]): string {
  return values.join("\n");
}

export default function ItcMasterSpecPanel({ projectId }: ItcMasterSpecPanelProps) {
  const [specs, setSpecs] = useState<ItcMasterSpec[]>([]);
  const [activeDiscipline, setActiveDiscipline] = useState<ItcTradeDiscipline>("Electrical");
  const [draft, setDraft] = useState<ItcMasterSpec | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await fetchItcMasterSpecs(projectId);
    setSpecs(rows);
    const current = rows.find((row) => row.discipline === activeDiscipline) ?? rows[0] ?? null;
    setDraft(current);
    setLoading(false);
  }, [projectId, activeDiscipline]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const current = specs.find((row) => row.discipline === activeDiscipline) ?? null;
    setDraft(current);
  }, [activeDiscipline, specs]);

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setMessage(null);

    try {
      const result = await saveItcMasterSpec({
        projectId,
        discipline: draft.discipline,
        sub_services: draft.sub_services,
        zones: draft.zones,
        pit_numbers: draft.pit_numbers,
        materials: draft.materials,
        bedding_cover_specs: draft.bedding_cover_specs,
        rover_serial_numbers: draft.rover_serial_numbers,
        rover_operators: draft.rover_operators,
        service_types: draft.service_types,
        redline_markup_url: draft.redline_markup_url,
      });

      if (result.error) {
        setMessage(result.error);
        return;
      }
      setMessage("Master spec saved.");
      await load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Failed to save master spec.");
    } finally {
      setSaving(false);
    }
  };

  const handleRedlineUpload = async (file: File) => {
    if (!draft) return;
    setSaving(true);
    const upload = await uploadItcMarkup({
      projectId,
      discipline: draft.discipline,
      file,
    });
    if (upload.error || !upload.url) {
      setSaving(false);
      setMessage(upload.error ?? "Upload failed");
      return;
    }
    setDraft({ ...draft, redline_markup_url: upload.url });
    setSaving(false);
  };

  if (loading || !draft) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
        Loading master specification workbook…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={cardClass}>
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-bold text-slate-900">Master Specification Workbook</h2>
          <p className="text-sm text-slate-500">
            Define site-wide options for Electrical, Drainage, and Hydraulics. Material/size
            selections auto-populate bedding, cover, and separation on new ITCs.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-200 px-4 py-3">
          {DISCIPLINES.map((discipline) => (
            <button
              key={discipline}
              type="button"
              onClick={() => setActiveDiscipline(discipline)}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-semibold",
                activeDiscipline === discipline
                  ? "bg-orange-600 text-white"
                  : "bg-slate-100 text-slate-700"
              )}
            >
              {discipline}
            </button>
          ))}
        </div>

        <div className="grid gap-4 p-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Sub Services (one per line)
            </span>
            <textarea
              rows={4}
              value={arrayToLines(draft.sub_services)}
              onChange={(e) =>
                setDraft({ ...draft, sub_services: linesToArray(e.target.value) })
              }
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Zones (one per line)
            </span>
            <textarea
              rows={4}
              value={arrayToLines(draft.zones)}
              onChange={(e) => setDraft({ ...draft, zones: linesToArray(e.target.value) })}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Pit Numbers (one per line)
            </span>
            <textarea
              rows={4}
              value={arrayToLines(draft.pit_numbers)}
              onChange={(e) =>
                setDraft({ ...draft, pit_numbers: linesToArray(e.target.value) })
              }
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Materials &amp; Sizes (one per line)
            </span>
            <textarea
              rows={4}
              value={arrayToLines(draft.materials)}
              onChange={(e) => setDraft({ ...draft, materials: linesToArray(e.target.value) })}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Service Types (one per line)
            </span>
            <textarea
              rows={4}
              value={arrayToLines(draft.service_types)}
              onChange={(e) =>
                setDraft({ ...draft, service_types: linesToArray(e.target.value) })
              }
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Rover Serial Numbers (one per line)
            </span>
            <textarea
              rows={4}
              value={arrayToLines(draft.rover_serial_numbers)}
              onChange={(e) =>
                setDraft({ ...draft, rover_serial_numbers: linesToArray(e.target.value) })
              }
              className={inputClass}
            />
          </label>
          <label className="block md:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Rover Operators (one per line)
            </span>
            <textarea
              rows={3}
              value={arrayToLines(draft.rover_operators)}
              onChange={(e) =>
                setDraft({ ...draft, rover_operators: linesToArray(e.target.value) })
              }
              className={inputClass}
            />
          </label>
          <label className="block md:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Redline Markup (PDF or image)
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="file"
                accept=".pdf,image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleRedlineUpload(file);
                }}
                className="text-sm"
              />
              {draft.redline_markup_url ? (
                <a
                  href={draft.redline_markup_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold text-orange-600 hover:underline"
                >
                  View current markup
                </a>
              ) : (
                <span className="text-sm text-slate-500">No markup uploaded</span>
              )}
            </div>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save {activeDiscipline} Master Spec
          </button>
          {message ? <p className="text-sm text-slate-600">{message}</p> : null}
        </div>
      </div>
    </div>
  );
}
