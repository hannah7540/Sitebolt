"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { Worker } from "@/lib/supabase";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import { cn } from "@/lib/utils";
import { inputClass, labelClass } from "@/lib/ui-classes";

interface SearchableWorkerPickerProps {
  workers: Worker[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  contactKind: "email" | "mobile";
}

function workerSearchHaystack(worker: Worker): string {
  return [
    getWorkerDisplayName(worker),
    worker.first_name,
    worker.last_name,
    worker.email,
    worker.phone,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");
}

export default function SearchableWorkerPicker({
  workers,
  selectedIds,
  onChange,
  contactKind,
}: SearchableWorkerPickerProps) {
  const [query, setQuery] = useState("");

  const selected = useMemo(() => {
    const ids = new Set(selectedIds);
    return workers.filter((worker) => ids.has(worker.id));
  }, [selectedIds, workers]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const selectedSet = new Set(selectedIds);
    return workers.filter((worker) => {
      if (selectedSet.has(worker.id)) return false;
      if (!needle) return true;
      return workerSearchHaystack(worker).includes(needle);
    });
  }, [query, selectedIds, workers]);

  const addWorker = (id: string) => {
    if (selectedIds.includes(id)) return;
    onChange([...selectedIds, id]);
    setQuery("");
  };

  const removeWorker = (id: string) => {
    onChange(selectedIds.filter((item) => item !== id));
  };

  return (
    <div className="space-y-2">
      <p className={labelClass}>Individual worker(s)</p>
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((worker) => (
            <span
              key={worker.id}
              className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-800"
            >
              {getWorkerDisplayName(worker)}
              <button
                type="button"
                onClick={() => removeWorker(worker.id)}
                className="rounded-full p-0.5 hover:bg-orange-100"
                aria-label={`Remove ${getWorkerDisplayName(worker)}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <input
        className={inputClass}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by name, email, or mobile…"
        aria-label="Search workers"
      />
      <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-1">
        {matches.length === 0 ? (
          <p className="px-2 py-3 text-sm text-slate-500">No matching workers.</p>
        ) : (
          matches.slice(0, 50).map((worker) => {
            const contact =
              contactKind === "email"
                ? String(worker.email ?? "").trim()
                : String(worker.phone ?? "").trim();
            return (
              <button
                key={worker.id}
                type="button"
                onClick={() => addWorker(worker.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-orange-50"
                )}
              >
                <span className="min-w-0 truncate font-medium text-slate-800">
                  {getWorkerDisplayName(worker)}
                </span>
                <span className="shrink-0 text-xs text-slate-500">{contact || "—"}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
