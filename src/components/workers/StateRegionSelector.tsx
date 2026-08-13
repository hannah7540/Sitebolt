"use client";

import { cn } from "@/lib/utils";
import { labelClass } from "@/lib/ui-classes";
import {
  WORKER_STATE_REGION_OPTIONS,
  type WorkerStateRegion,
} from "@/lib/worker-state-region";

interface StateRegionSelectorProps {
  id?: string;
  value: WorkerStateRegion | null;
  onChange: (value: WorkerStateRegion) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export default function StateRegionSelector({
  id = "worker-state-region",
  value,
  onChange,
  required = true,
  disabled = false,
  className,
}: StateRegionSelectorProps) {
  return (
    <fieldset className={className} disabled={disabled}>
      <legend className={labelClass}>
        State / Region{required ? " *" : ""}
      </legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {WORKER_STATE_REGION_OPTIONS.map((option) => {
          const selected = value === option;
          return (
            <label
              key={option}
              htmlFor={`${id}-${option}`}
              className={cn(
                "inline-flex cursor-pointer items-center rounded-full border px-3 py-1.5 text-sm font-semibold transition",
                selected
                  ? "border-orange-500 bg-orange-500 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-700 hover:border-orange-300 hover:text-orange-700",
                disabled && "cursor-not-allowed opacity-60"
              )}
            >
              <input
                id={`${id}-${option}`}
                type="radio"
                name={id}
                value={option}
                checked={selected}
                onChange={() => onChange(option)}
                required={required}
                disabled={disabled}
                className="sr-only"
              />
              {option}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
