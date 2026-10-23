"use client";

import { useEffect, useState } from "react";
import {
  fetchSubcontractorSelectOptions,
  type SubcontractorSelectOption,
} from "@/lib/subcontractors";
import { inputClass, labelClass } from "@/lib/ui-classes";

const UNASSIGNED_VALUE = "";

export default function SubcontractorSelect({
  value,
  onChange,
  label = "Assign to Subcontractor (Optional)",
  disabled = false,
}: {
  value: string | null | undefined;
  onChange: (
    subcontractorId: string | null,
    subcontractorName?: string | null
  ) => void;
  label?: string;
  disabled?: boolean;
}) {
  const [options, setOptions] = useState<SubcontractorSelectOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchSubcontractorSelectOptions().then((list) => {
      if (cancelled) return;
      setOptions(list);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = value?.trim() ?? UNASSIGNED_VALUE;

  return (
    <label className="block space-y-1">
      <span className={labelClass}>{label}</span>
      <select
        className={inputClass}
        value={selected}
        disabled={disabled || loading}
        onChange={(event) => {
          const next = event.target.value.trim();
          if (next === UNASSIGNED_VALUE) {
            onChange(null, null);
            return;
          }
          const selectedOption = options.find((option) => option.id === next);
          onChange(next, selectedOption?.name ?? null);
        }}
      >
        <option value={UNASSIGNED_VALUE}>No subcontractor assigned</option>
        {loading && options.length === 0 ? (
          <option value="" disabled>
            Loading subcontractors…
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}
