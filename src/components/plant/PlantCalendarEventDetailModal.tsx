"use client";

import { useState } from "react";
import { X } from "lucide-react";
import ConfirmDeletionDialog from "@/components/ui/ConfirmDeletionDialog";
import {
  formatPlantCalendarDotDate,
  formatPlantCalendarEventLabel,
  type PlantCalendarEvent,
} from "@/components/plant/plant-calendar-events";
import { cn } from "@/lib/utils";
import { modalClass, modalOverlayClass } from "@/lib/ui-classes";

interface PlantCalendarEventDetailModalProps {
  event: PlantCalendarEvent | null;
  plantName: string;
  deleting?: boolean;
  onClose: () => void;
  onDelete: () => Promise<void> | void;
}

export default function PlantCalendarEventDetailModal({
  event,
  plantName,
  deleting = false,
  onClose,
  onDelete,
}: PlantCalendarEventDetailModalProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!event) return null;

  return (
    <>
      <div className={modalOverlayClass} onClick={onClose} role="dialog" aria-modal="true">
        <div
          className={cn(modalClass, "max-w-md")}
          onClick={(clickEvent) => clickEvent.stopPropagation()}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {formatPlantCalendarEventLabel(event)}
              </h2>
              <p className="mt-1 text-sm text-slate-500">{plantName}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Type</dt>
              <dd className="mt-0.5 font-medium text-slate-900">
                {event.event_type === "service" ? "Service" : "Other"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date</dt>
              <dd className="mt-0.5 font-medium text-slate-900">
                {formatPlantCalendarDotDate(event.event_date)}
              </dd>
            </div>
            {event.notes ? (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Notes
                </dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-slate-800">{event.notes}</dd>
              </div>
            ) : null}
          </dl>

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Delete event
            </button>
          </div>
        </div>
      </div>

      <ConfirmDeletionDialog
        open={confirmOpen}
        confirming={deleting}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void onDelete()}
      />
    </>
  );
}
