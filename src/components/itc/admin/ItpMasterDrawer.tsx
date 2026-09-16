"use client";

import { useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import ItpItcPlanCanvas from "@/components/itc/admin/ItpItcPlanCanvas";
import { adminItcPinMarker, parseAdminItcSequence } from "@/components/itc/admin/itp-itc-admin-numbering";
import {
  ADMIN_STATUS_CLASSES,
  ADMIN_STATUS_LABELS,
  formatAdminDate,
  saveAdminItpRecord,
  uploadItpPlan,
  type AdminItcRecord,
  type AdminItpRecord,
  type AdminStatusBadge,
} from "@/components/itc/admin/itp-itc-admin-api";
import Toast from "@/components/ui/Toast";
import {
  inputClass,
  modalBodyClass,
  modalCloseIconButtonClass,
  modalOverlayClass,
  modalShellClass,
  modalStickyFooterClass,
} from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface ItpMasterDrawerProps {
  itp: AdminItpRecord;
  itcs: AdminItcRecord[];
  loading?: boolean;
  onClose: () => void;
  onOpenItc: (id: string) => void;
  onSaved?: (itp: AdminItpRecord) => void;
}

const STATUS_OPTIONS: Array<{ value: AdminStatusBadge; label: string }> = [
  { value: "active", label: "Draft" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
];

export default function ItpMasterDrawer({
  itp,
  itcs,
  loading = false,
  onClose,
  onOpenItc,
  onSaved,
}: ItpMasterDrawerProps) {
  const [title, setTitle] = useState(itp.title);
  const [area, setArea] = useState(itp.area ?? "");
  const [client, setClient] = useState(itp.client ?? "");
  const [managingContractor, setManagingContractor] = useState(itp.managing_contractor ?? "");
  const [subcontractor, setSubcontractor] = useState(itp.subcontractor ?? "");
  const [drawingRef, setDrawingRef] = useState(itp.drawing_ref ?? "");
  const [status, setStatus] = useState<AdminStatusBadge>(itp.status);
  const [planUrl, setPlanUrl] = useState(itp.plan_url);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const pins = itcs
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
    });

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
              <ItpItcPlanCanvas
                planUrl={planUrl}
                pins={pins}
                emptyHint="No plan drawing uploaded for this ITP."
                onPinClick={(pin) => onOpenItc(pin.id)}
              />
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-900">Associated ITCs</h3>
                {itcs.length === 0 ? (
                  <p className="text-sm text-slate-500">No pins have been saved against this ITP yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {itcs.map((itc, index) => (
                      <li key={itc.id}>
                        <button
                          type="button"
                          onClick={() => onOpenItc(itc.id)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-orange-50"
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
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {message ? <p className="text-sm text-rose-600">{message}</p> : null}
            </div>
          )}
        </div>
        <div className={`${modalStickyFooterClass} flex justify-end gap-2`}>
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
      {toast ? (
        <div onClick={(event) => event.stopPropagation()}>
          <Toast message={toast} variant="success" onDismiss={() => setToast(null)} />
        </div>
      ) : null}
    </div>
  );
}
