"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Upload, X } from "lucide-react";
import ItpItcPlanCanvas from "@/components/itc/admin/ItpItcPlanCanvas";
import {
  adminItcPinMarker,
  formatAdminItcNumber,
  parseAdminItcSequence,
} from "@/components/itc/admin/itp-itc-admin-numbering";
import {
  ADMIN_STATUS_CLASSES,
  ADMIN_STATUS_LABELS,
  allocateAdminItcNumber,
  createAdminItcFromPin,
  formatAdminDate,
  saveAdminItpRecord,
  uploadItpPlan,
  type AdminItcRecord,
  type AdminItpRecord,
  type AdminStatusBadge,
} from "@/components/itc/admin/itp-itc-admin-api";
import {
  ADMIN_PIPE_MATERIALS,
  ADMIN_PIPE_SIZES,
  getAdminItpTemplate,
} from "@/components/itc/admin/itp-itc-admin-types";
import Toast from "@/components/ui/Toast";
import {
  inputClass,
  modalBodyClass,
  modalClass,
  modalCloseIconButtonClass,
  modalOverlayClass,
  modalShellClass,
  modalStickyFooterClass,
} from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface ItpMasterDrawerProps {
  itp: AdminItpRecord;
  itcs: AdminItcRecord[];
  projectName: string;
  loading?: boolean;
  onClose: () => void;
  onOpenItc: (id: string) => void;
  onSaved?: (itp: AdminItpRecord) => void;
  onCreatedItc?: (itc: AdminItcRecord) => void;
  onRequestDeleteItp?: () => void;
  onRequestDeleteItc?: (itc: AdminItcRecord) => void;
}

const STATUS_OPTIONS: Array<{ value: AdminStatusBadge; label: string }> = [
  { value: "active", label: "Draft" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
];

export default function ItpMasterDrawer({
  itp,
  itcs,
  projectName,
  loading = false,
  onClose,
  onOpenItc,
  onSaved,
  onCreatedItc,
  onRequestDeleteItp,
  onRequestDeleteItc,
}: ItpMasterDrawerProps) {
  const [title, setTitle] = useState(itp.title);
  const [area, setArea] = useState(itp.area ?? "");
  const [client, setClient] = useState(itp.client ?? "");
  const [managingContractor, setManagingContractor] = useState(itp.managing_contractor ?? "");
  const [subcontractor, setSubcontractor] = useState(itp.subcontractor ?? "");
  const [drawingRef, setDrawingRef] = useState(itp.drawing_ref ?? "");
  const [status, setStatus] = useState<AdminStatusBadge>(itp.status);
  const [planUrl, setPlanUrl] = useState(itp.plan_url);
  const [localItcs, setLocalItcs] = useState(itcs);
  const [dropMode, setDropMode] = useState(false);
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null);
  const [pendingNumber, setPendingNumber] = useState("");
  const [runNumber, setRunNumber] = useState("");
  const [pipeSize, setPipeSize] = useState("100mm");
  const [pipeMaterial, setPipeMaterial] = useState("PVC");
  const [saving, setSaving] = useState(false);
  const [savingPin, setSavingPin] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setLocalItcs(itcs);
  }, [itcs]);

  const template = getAdminItpTemplate(itp.template_key);

  const pins = useMemo(
    () =>
      localItcs
        .filter((row) => row.pin_x != null && row.pin_y != null)
        .map((row, index) => {
          const sequence = parseAdminItcSequence(row.number) ?? index + 1;
          return {
            id: row.id,
            x: row.pin_x as number,
            y: row.pin_y as number,
            number: sequence,
            marker: adminItcPinMarker(row.number, index + 1),
            label: row.number,
          };
        }),
    [localItcs]
  );

  const currentItp = (): AdminItpRecord => ({
    ...itp,
    title: title.trim() || itp.title,
    area: area.trim() || null,
    client: client.trim() || null,
    managing_contractor: managingContractor.trim() || null,
    subcontractor: subcontractor.trim() || null,
    drawing_ref: drawingRef.trim() || null,
    status,
    plan_url: planUrl,
  });

  const handlePlan = async (file: File) => {
    setUploading(true);
    setMessage(null);
    const uploaded = await uploadItpPlan({ projectId: itp.project_id, file });
    setUploading(false);
    if (!uploaded.url && uploaded.error) {
      setMessage(uploaded.error);
      return;
    }
    setPlanUrl(uploaded.url);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    const next = currentItp();
    const result = await saveAdminItpRecord(next);
    setSaving(false);
    if (result.error) {
      setMessage(result.error);
      return;
    }
    setToast("Changes saved successfully");
    onSaved?.(next);
  };

  const startDropMode = () => {
    if (!planUrl) {
      setMessage("Upload a plan drawing before dropping pins.");
      return;
    }
    setDropMode((current) => !current);
    setMessage(null);
  };

  const handleDrop = async (x: number, y: number) => {
    setDropMode(false);
    setPendingPin({ x, y });
    setRunNumber("");
    setMessage(null);
    const allocated = await allocateAdminItcNumber({
      projectId: itp.project_id,
      projectName,
      area: area.trim() || itp.area || "AREA",
      reservedNumbers: localItcs.map((row) => row.number),
    });
    setPendingNumber(allocated.number);
  };

  const savePin = async () => {
    if (!pendingPin) return;
    if (!runNumber.trim()) {
      setMessage("Enter a run / line number.");
      return;
    }
    setSavingPin(true);
    setMessage(null);
    const parent = currentItp();
    const result = await createAdminItcFromPin({
      projectId: itp.project_id,
      projectName,
      itp: parent,
      pinX: pendingPin.x,
      pinY: pendingPin.y,
      runNumber: runNumber.trim(),
      pipeSize,
      pipeMaterial,
      preferredNumber: pendingNumber,
      reservedNumbers: localItcs.map((row) => row.number),
      status: "in_progress",
    });
    setSavingPin(false);
    if (result.error || !result.itc) {
      setMessage(result.error ?? "Failed to create ITC");
      return;
    }
    const created = result.itc;
    setLocalItcs((current) => [...current, created]);
    setPendingPin(null);
    setPendingNumber("");
    setRunNumber("");
    setToast(`Created ITC ${created.number}`);
    onCreatedItc?.(created);
  };

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={cn(modalShellClass, "max-w-5xl")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
              Edit ITP
            </p>
            <h2 className="text-lg font-semibold text-slate-900">{itp.number}</h2>
            <p className="text-sm text-slate-500">{formatAdminDate(itp.created_at)}</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                ADMIN_STATUS_CLASSES[status]
              )}
            >
              {ADMIN_STATUS_LABELS[status]}
            </span>
            <button type="button" onClick={onClose} className={modalCloseIconButtonClass}>
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className={modalBodyClass}>
          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
              Loading associated pins…
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                    Title
                  </span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className={inputClass}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                    Line location / Area notes
                  </span>
                  <input
                    value={area}
                    onChange={(event) => setArea(event.target.value)}
                    className={inputClass}
                    placeholder="MP2, WP7, Level 4 Pour 3"
                  />
                </label>
                <label>
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                    Client
                  </span>
                  <input
                    value={client}
                    onChange={(event) => setClient(event.target.value)}
                    className={inputClass}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                    Managing contractor
                  </span>
                  <input
                    value={managingContractor}
                    onChange={(event) => setManagingContractor(event.target.value)}
                    className={inputClass}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                    Subcontractor
                  </span>
                  <input
                    value={subcontractor}
                    onChange={(event) => setSubcontractor(event.target.value)}
                    className={inputClass}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                    Drawing ref & rev
                  </span>
                  <input
                    value={drawingRef}
                    onChange={(event) => setDrawingRef(event.target.value)}
                    className={inputClass}
                    placeholder='e.g. "C0604 Rev B"'
                  />
                </label>
                <label>
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                    Status
                  </span>
                  <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value as AdminStatusBadge)}
                    className={inputClass}
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="inline-flex cursor-pointer items-end">
                  <span className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                    <Upload className="h-4 w-4" />
                    {uploading ? "Uploading…" : planUrl ? "Replace plan drawing" : "Upload plan drawing"}
                  </span>
                  <input
                    type="file"
                    accept="application/pdf,image/png,image/jpeg"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handlePlan(file);
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-600">
                  Interactive plan — click a pin to edit that ITC, or drop a new pin to create one.
                </p>
                <button
                  type="button"
                  onClick={startDropMode}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold",
                    dropMode ? "bg-orange-500 text-white" : "bg-slate-900 text-white"
                  )}
                >
                  <Plus className="h-4 w-4" />
                  {dropMode ? "Click plan to drop pin" : "+ Drop Pin to Add ITC"}
                </button>
              </div>
              <ItpItcPlanCanvas
                planUrl={planUrl}
                pins={pins}
                dropEnabled={dropMode}
                emptyHint="No plan drawing uploaded for this ITP."
                onDrop={(x, y) => void handleDrop(x, y)}
                onPinClick={(pin) => onOpenItc(pin.id)}
              />
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-900">Associated ITCs</h3>
                {localItcs.length === 0 ? (
                  <p className="text-sm text-slate-500">No pins have been saved against this ITP yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {localItcs.map((itc, index) => (
                      <li key={itc.id} className="flex items-stretch">
                        <button
                          type="button"
                          onClick={() => onOpenItc(itc.id)}
                          className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-orange-50"
                        >
                          <span>
                            <span className="font-semibold text-orange-600">
                              #{adminItcPinMarker(itc.number, index + 1)}
                            </span>{" "}
                            {itc.number}
                            {itc.run_number ? ` · ${itc.run_number}` : ""}
                          </span>
                          <span className="text-xs text-slate-500">
                            {[itc.pipe_size, itc.pipe_material].filter(Boolean).join(" · ") ||
                              "Open checklist"}
                          </span>
                        </button>
                        {onRequestDeleteItc ? (
                          <button
                            type="button"
                            onClick={() => onRequestDeleteItc(itc)}
                            className="px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {message ? <p className="text-sm text-rose-600">{message}</p> : null}
            </div>
          )}
        </div>
        <div className={`${modalStickyFooterClass} flex flex-wrap items-center justify-between gap-2`}>
          {onRequestDeleteItp ? (
            <button
              type="button"
              onClick={onRequestDeleteItp}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              title={`Delete ITP and All Associated ITCs? Are you sure you want to delete ${itp.number} - ${title}? This action cannot be undone and will permanently delete this plan and all associated ITCs, checklist records, photos, and pins.`}
            >
              Delete ITP
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save Changes
          </button>
          </div>
        </div>
      </div>

      {pendingPin ? (
        <div
          className={`${modalOverlayClass} z-[60]`}
          onClick={(event) => {
            event.stopPropagation();
            setPendingPin(null);
          }}
        >
          <div className={`${modalClass} max-w-lg`} onClick={(event) => event.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">New ITC Pin</h3>
            <p className="mb-4 text-sm text-slate-500">
              Pin at {(pendingPin.x * 100).toFixed(1)}% × {(pendingPin.y * 100).toFixed(1)}%
            </p>
            <div className="space-y-3">
              <div>
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                  ITC number
                </span>
                <p className="inline-flex items-center rounded-full bg-orange-100 px-3 py-1.5 font-mono text-sm font-bold text-orange-800">
                  {pendingNumber ||
                    formatAdminItcNumber(projectName, area || itp.area || "AREA", localItcs.length + 1)}
                </p>
              </div>
              <dl className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold uppercase text-slate-500">Project</dt>
                  <dd>{projectName}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-slate-500">Area</dt>
                  <dd>{area || itp.area || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-slate-500">Drawing ref</dt>
                  <dd>{drawingRef || itp.drawing_ref || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-slate-500">Template</dt>
                  <dd>{template?.title || "—"}</dd>
                </div>
              </dl>
              <label>
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                  Run / Line number
                </span>
                <input
                  value={runNumber}
                  onChange={(event) => setRunNumber(event.target.value)}
                  placeholder='e.g. "SW11-01 to SW11-02"'
                  className={inputClass}
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                  Pipe size
                </span>
                <select
                  value={pipeSize}
                  onChange={(event) => setPipeSize(event.target.value)}
                  className={inputClass}
                >
                  {ADMIN_PIPE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                  Pipe material
                </span>
                <select
                  value={pipeMaterial}
                  onChange={(event) => setPipeMaterial(event.target.value)}
                  className={inputClass}
                >
                  {ADMIN_PIPE_MATERIALS.map((material) => (
                    <option key={material} value={material}>
                      {material}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-slate-500">
                  Checklist from template
                </p>
                {template?.questions.length ? (
                  <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
                    {template.questions.map((question) => (
                      <li key={question.key}>{question.text}</li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-slate-500">No template questions on this ITP.</p>
                )}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              {message ? <p className="mr-auto self-center text-sm text-rose-600">{message}</p> : null}
              <button
                type="button"
                onClick={() => setPendingPin(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void savePin()}
                disabled={savingPin}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white"
              >
                {savingPin ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Create ITC
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div onClick={(event) => event.stopPropagation()}>
          <Toast message={toast} variant="success" onDismiss={() => setToast(null)} />
        </div>
      ) : null}
    </div>
  );
}
