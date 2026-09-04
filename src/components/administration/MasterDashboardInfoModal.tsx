"use client";

import { X } from "lucide-react";
import { modalClass, modalOverlayClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface MasterDashboardInfoModalProps {
  title: string;
  subtitle?: string;
  rows: Array<{ label: string; value: string }>;
  onClose: () => void;
}

export default function MasterDashboardInfoModal({
  title,
  subtitle,
  rows,
  onClose,
}: MasterDashboardInfoModalProps) {
  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={cn(modalClass, "max-w-lg")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-600 text-white shadow-sm hover:bg-red-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <dl className="space-y-3">
          {rows.map((row) => (
            <div key={row.label}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {row.label}
              </dt>
              <dd className="mt-1 text-sm text-slate-900">{row.value || "—"}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
