"use client";

import { useMemo } from "react";
import AutocompleteField from "@/components/ui/AutocompleteField";
import { isWorkerRevoked, type Worker } from "@/lib/supabase";
import { getWorkerDisplayName } from "@/lib/worker-utils";

const SEARCH_PLACEHOLDER = "Search workers by name or email...";

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

export default function WorkerSearchSelect(props: WorkerSearchSelectProps) {
  const {
    workers,
    disabled = false,
    label,
    required = false,
    searchPlaceholder = SEARCH_PLACEHOLDER,
    placeholder,
    unassignedOptionLabel,
    getWorkerLabel = getWorkerDisplayName,
    id,
  } = props;

  const options = useMemo(
    () =>
      [...(Array.isArray(workers) ? workers : [])]
        .filter(
          (worker): worker is Worker =>
            Boolean(worker) &&
            typeof worker.id === "string" &&
            worker.id.trim().length > 0 &&
            !isWorkerRevoked(worker)
        )
        .sort((left, right) => {
          try {
            return getWorkerLabel(left).localeCompare(getWorkerLabel(right));
          } catch {
            return 0;
          }
        })
        .map((worker) => ({
          id: worker.id,
          label: getWorkerLabel(worker),
          description: worker.email?.trim() || undefined,
        })),
    [getWorkerLabel, workers]
  );

  const fieldPlaceholder = placeholder ?? searchPlaceholder;

  if (props.mode === "multiple") {
    return (
      <AutocompleteField
        mode="multiple"
        id={id}
        label={label}
        required={required}
        disabled={disabled}
        options={options}
        selected={props.selected}
        onChange={props.onChange}
        placeholder={fieldPlaceholder}
        emptyMessage="No workers assigned to this project"
        noMatchesMessage="No workers match your search."
      />
    );
  }

  return (
    <AutocompleteField
      mode="single"
      id={id}
      label={label}
      required={required}
      disabled={disabled}
      options={options}
      selected={props.selected}
      onChange={props.onChange}
      allowClear={props.allowClear}
      placeholder={fieldPlaceholder}
      emptyMessage="No workers assigned to this project"
      noMatchesMessage="No workers match your search."
      pinnedOption={
        unassignedOptionLabel
          ? { id: "__unassigned__", label: unassignedOptionLabel }
          : null
      }
    />
  );
}
