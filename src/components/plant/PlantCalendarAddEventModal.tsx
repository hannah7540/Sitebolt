"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  formatPlantCalendarDotDate,
  type PlantCalendarEventType,
} from "@/components/plant/plant-calendar-events";
import { cn } from "@/lib/utils";
import {
  inputClass,
  labelClass,
  modalBodyClass,
  modalOverlayClass,
  modalShellClass,
  modalStickyFooterClass,
} from "@/lib/ui-classes";

interface PlantCalendarAddEventModalProps {
  open: boolean;
  plantName: string;
  initialDate: string;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (input: {
    event_date: string;
    event_type: PlantCalendarEventType;
    title: string;
    notes: string;
  }) => Promise<void> | void;
}

export default function PlantCalendarAddEventModal({
  open,
  plantName,
  initialDate,
  saving = false,
  error = null,
  onClose,
  onSave,
}: PlantCalendarAddEventModalProps) {
  const [eventType, setEventType] = useState<PlantCalendarEventType>("service");
  const [eventDate, setEventDate] = useState(initialDate);
  const [otherTitle, setOtherTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEventType("service");
    setEventDate(initialDate);
    setOtherTitle("");
    setNotes("");
    setLocalError(null);
  }, [initialDate, open]);

  if (!open) return null;

  const handleSave = async () => {
    if (!eventDate) {
      setLocalError("Choose a date for this event.");
      return;
    }
    if (eventType === "other" && !otherTitle.trim()) {
      setLocalError("Enter a description for this event.");
      return;
    }
    setLocalError(null);
    await onSave({
      event_date: eventDate,
      event_type: eventType,
      title: eventType === "service" ? "Service" : otherTitle.trim(),
      notes: notes.trim(),
    });
  };

  return (
    <div className={modalOverlayClass} onClick={onClose} role="dialog" aria-modal="true">
      <div
        className={cn(modalShellClass, "max-w-lg")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Add Event - {plantName} - {formatPlantCalendarDotDate(eventDate || initialDate)}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Schedule a service or other maintenance event on this date.
            </p>
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

        <div className={cn(modalBodyClass, "space-y-4")}>
          <div>
            <p className={labelClass}>Event type</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEventType("service")}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm font-semibold",
                  eventType === "service"
                    ? "border-orange-300 bg-orange-50 text-orange-800"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                )}
              >
                Service
              </button>
              <button
                type="button"
                onClick={() => setEventType("other")}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm font-semibold",
                  eventType === "other"
                    ? "border-orange-300 bg-orange-50 text-orange-800"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                )}
              >
                Other
              </button>
            </div>
          </div>

          {eventType === "other" ? (
            <label className="block">
              <span className={labelClass}>Description</span>
              <input
                className={inputClass}
                value={otherTitle}
                onChange={(event) => setOtherTitle(event.target.value)}
                placeholder='e.g. "Brakes", "Hydraulic Hose", "Track Tensioning"'
              />
            </label>
          ) : (
            <label className="block">
              <span className={labelClass}>Notes / service provider</span>
              <input
                className={inputClass}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional workshop or notes"
              />
            </label>
          )}

          {eventType === "other" ? (
            <label className="block">
              <span className={labelClass}>Notes</span>
              <input
                className={inputClass}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional notes"
              />
            </label>
          ) : null}

          <label className="block">
            <span className={labelClass}>Date ({formatPlantCalendarDotDate(eventDate)})</span>
            <input
              type="date"
              className={inputClass}
              value={eventDate}
              onChange={(event) => setEventDate(event.target.value)}
            />
          </label>

          {localError || error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {localError || error}
            </p>
          ) : null}
        </div>

        <div className={cn(modalStickyFooterClass, "flex justify-end gap-2 py-3")}>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save Event
          </button>
        </div>
      </div>
    </div>
  );
}
