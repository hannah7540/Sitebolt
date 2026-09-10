"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import {
  COMPANY_CALENDAR_STATES,
  insertCompanyCalendarDays,
} from "@/lib/company-calendar-days";
import { formatDateOnly } from "@/lib/scheduler-utils";
import {
  inputClass,
  labelClass,
  modalClass,
  modalOverlayClass,
} from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface BulkAddCompanyRdosModalProps {
  onClose: () => void;
  onSaved: () => void;
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("en-AU", {
    month: "long",
    year: "numeric",
  });
}

function buildMonthCells(year: number, month: number): Array<string | null> {
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<string | null> = Array.from({ length: startPad }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(formatDateOnly(new Date(year, month, day)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function BulkAddCompanyRdosModal({
  onClose,
  onSaved,
}: BulkAddCompanyRdosModalProps) {
  const today = new Date();
  const [cursor, setCursor] = useState({
    year: today.getFullYear(),
    month: today.getMonth(),
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("Industry RDO");
  const [state, setState] = useState("ALL");
  const [roles, setRoles] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cells = useMemo(
    () => buildMonthCells(cursor.year, cursor.month),
    [cursor.month, cursor.year]
  );

  const toggleDate = (iso: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(iso)) next.delete(iso);
      else next.add(iso);
      return next;
    });
  };

  const handleSave = async () => {
    if (selected.size === 0) {
      setError("Select at least one date.");
      return;
    }

    setSaving(true);
    setError(null);
    const applicableRoles = roles
      .split(",")
      .map((role) => role.trim())
      .filter(Boolean);

    const result = await insertCompanyCalendarDays(
      [...selected].sort().map((date) => ({
        date,
        day_type: "rdo",
        title,
        state,
        applicable_roles: applicableRoles.length > 0 ? applicableRoles : null,
      }))
    );
    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    onSaved();
    onClose();
  };

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={cn(modalClass, "max-w-lg")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Bulk Add RDOs</h2>
            <p className="text-sm text-slate-500">
              Select one or more dates, then save them as company RDOs in one click.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() =>
              setCursor((current) => {
                const month = current.month === 0 ? 11 : current.month - 1;
                const year = current.month === 0 ? current.year - 1 : current.year;
                return { year, month };
              })
            }
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="text-sm font-semibold text-slate-900">
            {monthLabel(cursor.year, cursor.month)}
          </p>
          <button
            type="button"
            onClick={() =>
              setCursor((current) => {
                const month = current.month === 11 ? 0 : current.month + 1;
                const year = current.month === 11 ? current.year + 1 : current.year;
                return { year, month };
              })
            }
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
            <div key={day}>{day}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((iso, index) =>
            iso ? (
              <button
                key={iso}
                type="button"
                onClick={() => toggleDate(iso)}
                className={cn(
                  "min-h-9 rounded-lg text-sm font-medium",
                  selected.has(iso)
                    ? "bg-orange-500 text-white"
                    : "bg-slate-50 text-slate-800 hover:bg-orange-50"
                )}
              >
                {Number(iso.slice(8, 10))}
              </button>
            ) : (
              <div key={`empty-${index}`} />
            )
          )}
        </div>

        <p className="mt-3 text-xs text-slate-500">
          {selected.size} date{selected.size === 1 ? "" : "s"} selected
          {selected.size > 0 ? `: ${[...selected].sort().join(", ")}` : ""}.
        </p>

        <div className="mt-4 space-y-3">
          <label className="block space-y-1">
            <span className={labelClass}>Title</span>
            <input
              className={inputClass}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>State</span>
            <select
              className={inputClass}
              value={state}
              onChange={(event) => setState(event.target.value)}
            >
              {COMPANY_CALENDAR_STATES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>Applicable roles (optional)</span>
            <input
              className={inputClass}
              value={roles}
              onChange={(event) => setRoles(event.target.value)}
              placeholder="Leave blank for all employees"
            />
          </label>
        </div>

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save RDOs
          </button>
        </div>
      </div>
    </div>
  );
}
