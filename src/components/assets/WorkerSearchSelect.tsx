"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import DropdownPanel from "@/components/ui/DropdownPanel";
import { isWorkerRevoked, type Worker } from "@/lib/supabase";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import { cn } from "@/lib/utils";
import { inputClass, labelClass } from "@/lib/ui-classes";

const SEARCH_PLACEHOLDER = "Search workers by name or email...";

function workerMatchesQuery(worker: Worker, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;

  const name = getWorkerDisplayName(worker).toLowerCase();
  const firstName = (worker.first_name ?? "").toLowerCase();
  const lastName = (worker.last_name ?? "").toLowerCase();
  const email = (worker.email ?? "").toLowerCase();
  const trade = (worker.trade ?? "").toLowerCase();

  return (
    name.includes(q) ||
    firstName.includes(q) ||
    lastName.includes(q) ||
    email.includes(q) ||
    trade.includes(q)
  );
}

type WorkerSearchSelectBaseProps = {
  workers: Worker[];
  disabled?: boolean;
  label?: string;
  required?: boolean;
  searchPlaceholder?: string;
  placeholder?: string;
  /** When set in single mode, shows a pinned unassigned option at the top of the list. */
  unassignedOptionLabel?: string;
  getWorkerLabel?: (worker: Worker) => string;
  id?: string;
};

type WorkerSearchSelectSingleProps = WorkerSearchSelectBaseProps & {
  mode: "single";
  selected: string | null;
  onChange: (id: string | null) => void;
  allowClear?: boolean;
};

type WorkerSearchSelectMultipleProps = WorkerSearchSelectBaseProps & {
  mode: "multiple";
  selected: string[];
  onChange: (ids: string[]) => void;
};

export type WorkerSearchSelectProps =
  | WorkerSearchSelectSingleProps
  | WorkerSearchSelectMultipleProps;

function WorkerOptionRow({
  worker,
  checked,
  mode,
  disabled,
  onSelect,
  getWorkerLabel,
}: {
  worker: Worker;
  checked: boolean;
  mode: "single" | "multiple";
  disabled: boolean;
  onSelect: () => void;
  getWorkerLabel: (worker: Worker) => string;
}) {
  const revoked = isWorkerRevoked(worker);

  if (mode === "multiple") {
    return (
      <label
        className={cn(
          "flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 hover:bg-orange-50",
          checked && "bg-orange-50/70",
          revoked && "opacity-60"
        )}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={onSelect}
          disabled={disabled || revoked}
          className="mt-0.5 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
        />
        <WorkerOptionContent
          worker={worker}
          revoked={revoked}
          getWorkerLabel={getWorkerLabel}
        />
      </label>
    );
  }

  return (
    <button
      type="button"
      role="option"
      aria-selected={checked}
      disabled={disabled || revoked}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start rounded-lg px-2 py-2 text-left hover:bg-orange-50",
        checked && "bg-orange-50/70",
        revoked && "opacity-60"
      )}
    >
      <WorkerOptionContent
        worker={worker}
        revoked={revoked}
        getWorkerLabel={getWorkerLabel}
      />
    </button>
  );
}

function WorkerOptionContent({
  worker,
  revoked,
  getWorkerLabel,
}: {
  worker: Worker;
  revoked: boolean;
  getWorkerLabel: (worker: Worker) => string;
}) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-medium text-slate-900">
        {getWorkerLabel(worker)}
        {revoked ? (
          <span className="ml-1 text-xs font-normal text-slate-500">(inactive)</span>
        ) : null}
      </span>
      {worker.email ? (
        <span className="block truncate text-xs text-slate-500">{worker.email}</span>
      ) : null}
    </span>
  );
}

export default function WorkerSearchSelect(props: WorkerSearchSelectProps) {
  const {
    workers,
    disabled = false,
    label,
    required = false,
    searchPlaceholder = SEARCH_PLACEHOLDER,
    placeholder = "Select worker…",
    unassignedOptionLabel,
    getWorkerLabel = getWorkerDisplayName,
    id,
  } = props;

  const mode = props.mode;
  const triggerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setSearchQuery("");
  }, []);

  const activeWorkers = useMemo(
    () =>
      [...workers]
        .filter((worker) => !isWorkerRevoked(worker))
        .sort((left, right) =>
          getWorkerLabel(left).localeCompare(getWorkerLabel(right))
        ),
    [getWorkerLabel, workers]
  );

  const workerById = useMemo(() => {
    const map = new Map<string, Worker>();
    for (const worker of workers) {
      map.set(worker.id, worker);
    }
    return map;
  }, [workers]);

  const filteredWorkers = useMemo(
    () => activeWorkers.filter((worker) => workerMatchesQuery(worker, searchQuery)),
    [activeWorkers, searchQuery]
  );

  const selectedIds = mode === "multiple" ? props.selected : props.selected ? [props.selected] : [];

  const selectedWorkers = useMemo(
    () =>
      selectedIds
        .map((workerId) => workerById.get(workerId))
        .filter((worker): worker is Worker => worker != null),
    [selectedIds, workerById]
  );

  const singleSelectedWorker = mode === "single" ? selectedWorkers[0] ?? null : null;

  useEffect(() => {
    if (!open) return;
    searchInputRef.current?.focus();
  }, [open]);

  const toggleWorker = (workerId: string) => {
    if (mode !== "multiple") return;
    props.onChange(
      props.selected.includes(workerId)
        ? props.selected.filter((id) => id !== workerId)
        : [...props.selected, workerId]
    );
  };

  const selectWorker = (workerId: string) => {
    if (mode !== "single") return;
    props.onChange(workerId);
    closeDropdown();
  };

  const selectUnassigned = () => {
    if (mode !== "single") return;
    props.onChange(null);
    closeDropdown();
  };

  const removeWorker = (workerId: string) => {
    if (mode === "multiple") {
      props.onChange(props.selected.filter((id) => id !== workerId));
      return;
    }
    if (props.allowClear !== false) {
      props.onChange(null);
    }
  };

  const triggerLabel =
    mode === "single"
      ? singleSelectedWorker
        ? getWorkerLabel(singleSelectedWorker)
        : unassignedOptionLabel ?? placeholder
      : selectedWorkers.length > 0
        ? `${selectedWorkers.length} worker${selectedWorkers.length === 1 ? "" : "s"} selected`
        : placeholder;

  return (
    <div className="space-y-2">
      {label ? (
        <label className={labelClass} htmlFor={id}>
          {label}
          {required ? " *" : ""}
        </label>
      ) : null}

      {mode === "multiple" && selectedWorkers.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selectedWorkers.map((worker) => (
            <span
              key={worker.id}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-900"
            >
              <span className="truncate">{getWorkerLabel(worker)}</span>
              <button
                type="button"
                onClick={() => removeWorker(worker.id)}
                disabled={disabled}
                className="rounded-full p-0.5 text-orange-700 hover:bg-orange-100 disabled:opacity-50"
                aria-label={`Remove ${getWorkerLabel(worker)}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div ref={triggerRef} className="relative">
        <button
          id={id}
          type="button"
          disabled={disabled}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-haspopup="listbox"
          className={cn(
            inputClass,
            "flex w-full items-center justify-between gap-2 pr-10 text-left",
            disabled && "cursor-not-allowed opacity-60"
          )}
        >
          <span
            className={cn(
              "min-w-0 truncate",
              selectedWorkers.length > 0 ? "text-slate-900" : "text-slate-500"
            )}
          >
            {triggerLabel}
          </span>
          <ChevronDown
            className={cn(
              "pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-transform",
              open && "rotate-180"
            )}
          />
        </button>

        {mode === "single" && singleSelectedWorker && props.allowClear !== false ? (
          <button
            type="button"
            onClick={() => removeWorker(singleSelectedWorker.id)}
            disabled={disabled}
            className="absolute right-8 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            aria-label={`Clear ${getWorkerLabel(singleSelectedWorker)}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <DropdownPanel
        open={open}
        triggerRef={triggerRef}
        maxHeight={320}
        onClose={closeDropdown}
      >
        <div className="border-b border-slate-200 p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={searchPlaceholder}
              className={`${inputClass} pl-9`}
              disabled={disabled}
              aria-label={searchPlaceholder}
            />
          </div>
        </div>

        <div
          className="max-h-56 overflow-y-auto p-2"
          role="listbox"
          aria-multiselectable={mode === "multiple"}
        >
          {mode === "single" && unassignedOptionLabel ? (
            <button
              type="button"
              role="option"
              aria-selected={!props.selected}
              disabled={disabled}
              onClick={selectUnassigned}
              className={cn(
                "mb-1 flex w-full rounded-lg px-2 py-2 text-left text-sm font-medium hover:bg-orange-50",
                !props.selected ? "bg-orange-50/70 text-orange-900" : "text-slate-700"
              )}
            >
              {unassignedOptionLabel}
            </button>
          ) : null}

          {activeWorkers.length === 0 ? (
            <p className="px-2 py-3 text-sm text-slate-500">No active workers available.</p>
          ) : filteredWorkers.length === 0 ? (
            <p className="px-2 py-3 text-sm text-slate-500">No workers match your search.</p>
          ) : (
            filteredWorkers.map((worker) => (
              <WorkerOptionRow
                key={worker.id}
                worker={worker}
                mode={mode}
                disabled={disabled}
                checked={selectedIds.includes(worker.id)}
                getWorkerLabel={getWorkerLabel}
                onSelect={() =>
                  mode === "multiple" ? toggleWorker(worker.id) : selectWorker(worker.id)
                }
              />
            ))
          )}
        </div>
      </DropdownPanel>
    </div>
  );
}
