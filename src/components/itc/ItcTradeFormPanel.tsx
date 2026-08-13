"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Plus, Save } from "lucide-react";
import {
  fetchItcMasterSpecs,
  resolveSpecAutoFill,
  type ItcTradeDiscipline,
} from "@/lib/itc-master-spec-service";
import {
  listElectricalConduitMaterials,
  type ElectricalConduitCategory,
} from "@/lib/itc-electrical-conduit-specs";
import {
  applySpecAutoFillToForm,
  EMPTY_TRADE_FORM,
  getTradeFormMissingFields,
  isTradeFormComplete,
  itcRowToTradeForm,
  tradeFormToItcPayload,
  type ItcTradeFormValues,
} from "@/lib/itc-trade-forms";
import {
  createItcDraft,
  fetchProjectItcs,
  updateItcTradeForm,
  type ProjectItc,
} from "@/lib/itc-service";
import { uploadItcMarkup } from "@/lib/itc-upload";
import { cardClass, inputClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface ItcTradeFormPanelProps {
  projectId: string;
}

const DISCIPLINES: ItcTradeDiscipline[] = ["Electrical", "Drainage", "Hydraulics"];

export default function ItcTradeFormPanel({ projectId }: ItcTradeFormPanelProps) {
  const [itcs, setItcs] = useState<ProjectItc[]>([]);
  const [discipline, setDiscipline] = useState<ItcTradeDiscipline>("Electrical");
  const [selectedItcId, setSelectedItcId] = useState("");
  const [form, setForm] = useState<ItcTradeFormValues>(EMPTY_TRADE_FORM);
  const [materials, setMaterials] = useState<string[]>([]);
  const [zones, setZones] = useState<string[]>([]);
  const [serviceTypes, setServiceTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [itcRows, specs] = await Promise.all([
      fetchProjectItcs(projectId),
      fetchItcMasterSpecs(projectId),
    ]);
    setItcs(itcRows);
    const spec = specs.find((row) => row.discipline === discipline);
    setMaterials(spec?.materials ?? []);
    setZones(spec?.zones ?? []);
    setServiceTypes(spec?.service_types ?? []);
    setLoading(false);
  }, [projectId, discipline]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredItcs = useMemo(
    () =>
      itcs.filter(
        (row) =>
          row.trade_discipline === discipline ||
          row.service_discipline === discipline ||
          (!row.trade_discipline && discipline === "Electrical")
      ),
    [itcs, discipline]
  );

  useEffect(() => {
    if (!selectedItcId && filteredItcs[0]) {
      setSelectedItcId(filteredItcs[0].id);
    }
  }, [filteredItcs, selectedItcId]);

  useEffect(() => {
    const itc = itcs.find((row) => row.id === selectedItcId);
    if (!itc) {
      setForm(EMPTY_TRADE_FORM);
      return;
    }
    setForm(itcRowToTradeForm(itc as unknown as Record<string, unknown>));
  }, [selectedItcId, itcs]);

  const missingFields = useMemo(
    () => getTradeFormMissingFields(discipline, form),
    [discipline, form]
  );
  const formComplete = isTradeFormComplete(discipline, form);

  const filteredMaterials = useMemo(() => {
    if (discipline !== "Electrical" || !form.service_type) return materials;
    const categoryMaterials = listElectricalConduitMaterials(
      form.service_type as ElectricalConduitCategory
    );
    return categoryMaterials.length > 0 ? categoryMaterials : materials;
  }, [discipline, form.service_type, materials]);

  const applyMaterialAutoFill = async (material: string, serviceType: string) => {
    const autoFill = await resolveSpecAutoFill(serviceType, material);
    setForm((current) =>
      applySpecAutoFillToForm({ ...current, material_and_size: material }, autoFill)
    );
  };

  const handleMaterialChange = async (material: string) => {
    const serviceType = form.service_type || discipline;
    await applyMaterialAutoFill(material, serviceType);
  };

  const handleServiceTypeChange = async (serviceType: string) => {
    setForm((current) => ({ ...current, service_type: serviceType }));
    if (form.material_and_size) {
      await applyMaterialAutoFill(form.material_and_size, serviceType);
    }
  };

  const handleCreateDraft = async () => {
    setCreating(true);
    setMessage(null);
    const defaultZone = zones[0] ?? form.zone ?? "SITE";
    const result = await createItcDraft({
      projectId,
      zoneCode: defaultZone,
      serviceDiscipline: discipline,
      serviceType: form.service_type || discipline,
    });
    setCreating(false);
    if (result.error || !result.itc) {
      setMessage(result.error ?? "Failed to create ITC draft.");
      return;
    }
    setMessage(`Draft created: ${result.itc.itc_number}`);
    await load();
    setSelectedItcId(result.itc.id);
  };

  const handleSave = async () => {
    if (!selectedItcId) return;
    setSaving(true);
    setMessage(null);
    const result = await updateItcTradeForm({
      itcId: selectedItcId,
      payload: tradeFormToItcPayload(discipline, form),
    });
    setSaving(false);
    if (result.error) {
      setMessage(result.error);
      return;
    }
    setMessage(
      formComplete
        ? "ITC saved."
        : "Draft saved. Warning: Service data incomplete — you can complete this later."
    );
    void load();
  };

  const handleRedlineUpload = async (file: File) => {
    setSaving(true);
    const upload = await uploadItcMarkup({ projectId, discipline, file });
    setSaving(false);
    if (upload.error || !upload.url) {
      setMessage(upload.error ?? "Upload failed");
      return;
    }
    setForm((current) => ({ ...current, redline_markup_url: upload.url! }));
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
        Loading Add ITC…
      </div>
    );
  }

  return (
    <div className={cardClass}>
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-lg font-bold text-slate-900">Add ITC</h2>
        <p className="text-sm text-slate-500">
          Create draft ITCs and configure service data for Electrical, Drainage, or Hydraulic runs.
          Drafts can be saved before all fields are complete.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 px-4 py-3">
        {DISCIPLINES.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              setDiscipline(item);
              setSelectedItcId("");
            }}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold",
              discipline === item ? "bg-orange-600 text-white" : "bg-slate-100 text-slate-700"
            )}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-[220px] flex-1">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">ITC</span>
            <select
              value={selectedItcId}
              onChange={(e) => setSelectedItcId(e.target.value)}
              className={inputClass}
            >
              <option value="">Select ITC</option>
              {filteredItcs.map((itc) => (
                <option key={itc.id} value={itc.id}>
                  {itc.itc_number} — {itc.zone_code ?? "No zone"}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={creating}
            onClick={() => void handleCreateDraft()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create Draft ITC
          </button>
        </div>

        {selectedItcId && !formComplete ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Warning: Service data incomplete</p>
              <p className="mt-1">
                You can save this draft and complete it later. Missing: {missingFields.join(", ")}.
              </p>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Zone</span>
            <select
              value={form.zone}
              onChange={(e) => setForm({ ...form, zone: e.target.value })}
              className={inputClass}
            >
              <option value="">Select zone</option>
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </label>

          {(discipline === "Drainage" || discipline === "Hydraulics" || discipline === "Electrical") && (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Service Type
              </span>
              <select
                value={form.service_type}
                onChange={(e) => void handleServiceTypeChange(e.target.value)}
                className={inputClass}
              >
                <option value="">Select service type</option>
                {serviceTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Material &amp; Size
            </span>
            <select
              value={form.material_and_size}
              onChange={(e) => void handleMaterialChange(e.target.value)}
              className={inputClass}
            >
              <option value="">Select material/size</option>
              {filteredMaterials.map((material) => (
                <option key={material} value={material}>
                  {material}
                </option>
              ))}
            </select>
          </label>

          {discipline === "Hydraulics" && (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Material Colour
              </span>
              <input
                value={form.material_colour}
                onChange={(e) => setForm({ ...form, material_colour: e.target.value })}
                className={inputClass}
                placeholder="e.g. Blue, Lilac"
              />
            </label>
          )}

          {discipline === "Electrical" && (
            <>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                  Length (m)
                </span>
                <input
                  type="number"
                  value={form.length_m ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, length_m: e.target.value ? Number(e.target.value) : null })
                  }
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                  Upstream Structure
                </span>
                <input
                  value={form.upstream_pit_number}
                  onChange={(e) => setForm({ ...form, upstream_pit_number: e.target.value })}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                  Downstream Structure
                </span>
                <input
                  value={form.downstream_pit_number}
                  onChange={(e) => setForm({ ...form, downstream_pit_number: e.target.value })}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                  Number of Conduits
                </span>
                <input
                  type="number"
                  value={form.number_of_conduits ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      number_of_conduits: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className={inputClass}
                />
              </label>
            </>
          )}

          {discipline === "Hydraulics" && (
            <>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                  Length of Run (m)
                </span>
                <input
                  type="number"
                  value={form.length_of_run_m ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      length_of_run_m: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                  Number of Tees
                </span>
                <input
                  type="number"
                  value={form.number_of_tees ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      number_of_tees: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                  Upstream Point
                </span>
                <input
                  value={form.upstream_pit_number}
                  onChange={(e) => setForm({ ...form, upstream_pit_number: e.target.value })}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                  Downstream Point
                </span>
                <input
                  value={form.downstream_pit_number}
                  onChange={(e) => setForm({ ...form, downstream_pit_number: e.target.value })}
                  className={inputClass}
                />
              </label>
            </>
          )}

          <label className="block md:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Redline Markup
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
              {form.redline_markup_url ? (
                <a
                  href={form.redline_markup_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold text-orange-600 hover:underline"
                >
                  View markup
                </a>
              ) : null}
            </div>
          </label>
        </div>

        {(form.min_bedding_mm != null || form.min_cover_mm != null) && (
          <div className="rounded-lg bg-orange-50 px-4 py-3 text-sm text-orange-900">
            <p className="font-semibold">Auto-filled from spec rules</p>
            <p>
              Bedding: {form.min_bedding_mm ?? "—"} mm · Cover: {form.min_cover_mm ?? "—"} mm ·
              H-Sep: {form.min_horizontal_sep_mm ?? "—"} mm · V-Sep:{" "}
              {form.min_vertical_sep_mm ?? "—"} mm
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={saving || !selectedItcId}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save ITC
          </button>
          {message ? <p className="text-sm text-slate-600">{message}</p> : null}
        </div>
      </div>
    </div>
  );
}
