"use client";

import { Loader2, X } from "lucide-react";
import ItpItcPlanCanvas from "@/components/itc/admin/ItpItcPlanCanvas";
import {
  ADMIN_STATUS_CLASSES,
  ADMIN_STATUS_LABELS,
  formatAdminDate,
  type AdminItcRecord,
  type AdminItpRecord,
} from "@/components/itc/admin/itp-itc-admin-api";
import {
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
}

export default function ItpMasterDrawer({
  itp,
  itcs,
  loading = false,
  onClose,
  onOpenItc,
}: ItpMasterDrawerProps) {
  const pins = itcs
    .filter((row) => row.pin_x != null && row.pin_y != null)
    .map((row, index) => ({
      id: row.id,
      x: row.pin_x as number,
      y: row.pin_y as number,
      number: index + 1,
      label: row.run_number || row.number,
    }));

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={cn(modalShellClass, "max-w-5xl")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
              ITP master view
            </p>
            <h2 className="text-lg font-semibold text-slate-900">
              {itp.number} · {itp.title}
            </h2>
            <p className="text-sm text-slate-500">
              {itp.area || "No area"} · {formatAdminDate(itp.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                ADMIN_STATUS_CLASSES[itp.status]
              )}
            >
              {ADMIN_STATUS_LABELS[itp.status]}
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
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs font-semibold uppercase text-slate-500">Client</dt>
                  <dd>{itp.client || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-slate-500">
                    Managing contractor
                  </dt>
                  <dd>{itp.managing_contractor || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-slate-500">Subcontractor</dt>
                  <dd>{itp.subcontractor || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-slate-500">Drawing ref</dt>
                  <dd>{itp.drawing_ref || "—"}</dd>
                </div>
              </dl>
              <ItpItcPlanCanvas
                planUrl={itp.plan_url}
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
                            <span className="font-semibold text-orange-600">#{index + 1}</span>{" "}
                            {itc.run_number || itc.number}
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
            </div>
          )}
        </div>
        <div className={modalStickyFooterClass}>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
