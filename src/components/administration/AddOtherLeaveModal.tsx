"use client";

import { useMemo, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import type { Worker } from "@/lib/supabase";
import {
  LEAVE_TYPE_OPTIONS,
  type CalendarLeaveKind,
} from "@/lib/calendar-event-styles";
import {
  insertBulkLeaveEvents,
  type BulkLeaveInput,
  type BulkRdoInsertResult,
} from "@/lib/worker-calendar-events";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import { modalOverlayClass, modalClass, inputClass, labelClass } from "@/lib/ui-classes";

interface AddOtherLeaveModalProps {
  workers: Worker[];
  onClose: () => void;
  onSaved: () => void;
  onSubmit?: (input: BulkLeaveInput) => Promise<BulkRdoInsertResult>;
}

export default function AddOtherLeaveModal({
  workers,
  onClose,
  onSaved,
  onSubmit,
}: AddOtherLeaveModalProps) {
  const today = new Date().toISOString().slice(0, 10);

  const [leaveKind, setLeaveKind] = useState<CalendarLeaveKind>("sick");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [tradeFilter, setTradeFilter] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedWorkers = useMemo(
    () =>
      [...workers].sort((left, right) =>
        getWorkerDisplayName(left).localeCompare(getWorkerDisplayName(right))
      ),
    [workers]
  );

  const tradeOptions = useMemo(() => {
    const trades = new Set<string>();
    for (const worker of sortedWorkers) {
      const trade = worker.trade?.trim();
      if (trade) trades.add(trade);
    }
    return [...trades].sort();
  }, [sortedWorkers]);

  const filteredWorkers = useMemo(() => {
    let list = sortedWorkers;
    if (tradeFilter) {
      list = list.filter((worker) => worker.trade?.trim() === tradeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((worker) => {
        const name = getWorkerDisplayName(worker).toLowerCase();
        const trade = (worker.trade ?? "").toLowerCase();
        return name.includes(q) || trade.includes(q) || worker.email.toLowerCase().includes(q);
      });
    }
    return list;
  }, [sortedWorkers, tradeFilter, searchQuery]);

  const toggleWorker = (workerId: string) => {
    setSelectedWorkerIds((prev) => {
      const next = new Set(prev);
      if (next.has(workerId)) next.delete(workerId);
      else next.add(workerId);
      return next;
    });
  };

  const handleSubmit = async () => {
    setError(null);
    if (startDate > endDate) {
      setError("End date must be on or after start date.");
      return;
    }

    const selectedWorkers = sortedWorkers.filter((worker) =>
      selectedWorkerIds.has(worker.id)
    );
    if (selectedWorkers.length === 0) {
      setError("Select at least one worker.");
      return;
    }

    setSaving(true);
    const payload: BulkLeaveInput = {
      startDate,
      endDate,
      leaveKind,
      workers: selectedWorkers,
      notes,
    };
    const result = onSubmit ? await onSubmit(payload) : await insertBulkLeaveEvents(payload);
    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (result.unavailable || result.created === 0) {
      onSaved();
      onClose();
      return;
    }

    onSaved();
    onClose();
  };

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={`${modalClass} flex max-h-[90vh] max-w-2xl flex-col overflow-hidden`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Add Other Leave</h2>
            <p className="text-sm text-slate-500">
              Schedule sick, personal, carers, or annual leave for selected workers.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <label className="block space-y-1">
            <span className={labelClass}>Leave Type</span>
            <select
              className={inputClass}
              value={leaveKind}
              onChange={(event) => setLeaveKind(event.target.value as CalendarLeaveKind)}
            >
              {LEAVE_TYPE_OPTIONS.map((option) => (
                <option key={option.kind} value={option.kind}>
                  {option.label} ({option.displayCode})
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className={labelClass}>Date From</span>
              <input
                type="date"
                className={inputClass}
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Date To</span>
              <input
                type="date"
                className={inputClass}
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={labelClass}>Select Worker(s)</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedWorkerIds(new Set(filteredWorkers.map((worker) => worker.id)))
                  }
                  className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-orange-50"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedWorkerIds(new Set())}
                  className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-orange-50"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  placeholder="Search workers…"
                  className={`${inputClass} pl-9`}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
              <select
                className={inputClass}
                value={tradeFilter}
                onChange={(event) => setTradeFilter(event.target.value)}
              >
                <option value="">All trades</option>
                {tradeOptions.map((trade) => (
                  <option key={trade} value={trade}>
                    {trade}
                  </option>
                ))}
              </select>
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {filteredWorkers.length === 0 ? (
                <p className="p-3 text-sm text-slate-500">No workers match.</p>
              ) : (
                filteredWorkers.map((worker) => (
                  <label
                    key={worker.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedWorkerIds.has(worker.id)}
                      onChange={() => toggleWorker(worker.id)}
                      className="rounded border-slate-300 text-orange-500"
                    />
                    <span className="text-sm text-slate-800">
                      {getWorkerDisplayName(worker)}
                      {worker.trade ? (
                        <span className="ml-1 text-xs text-slate-500">· {worker.trade}</span>
                      ) : null}
                    </span>
                  </label>
                ))
              )}
            </div>
            <p className="text-xs text-slate-500">
              {selectedWorkerIds.size} worker(s) selected.
            </p>
          </div>

          <label className="block space-y-1">
            <span className={labelClass}>Notes / Reason</span>
            <textarea
              className={`${inputClass} min-h-[90px]`}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional reason or notes…"
            />
          </label>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || selectedWorkerIds.size === 0}
            onClick={() => void handleSubmit()}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save Leave
          </button>
        </div>
      </div>
    </div>
  );
}
