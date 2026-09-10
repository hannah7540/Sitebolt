"use client";

import { cn } from "@/lib/utils";
import { labelClass } from "@/lib/ui-classes";
import {
  WORKER_STATE_REGION_OPTIONS,
  type WorkerStateRegion,
} from "@/lib/worker-state-region";
import { resolvePayRuleTemplateNameForWorker } from "@/lib/worker-pay-rule-assignment";

interface StateRegionSelectorProps {
  id?: string;
  value: WorkerStateRegion | null;
  onChange: (value: WorkerStateRegion) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  error?: string;
  fieldId?: string;
}

export default function StateRegionSelector({
  id = "worker-state-region",
  value,
  onChange,
  required = true,
  disabled = false,
  className,
  error,
  fieldId,
}: StateRegionSelectorProps) {
  const assignedPayRule = resolvePayRuleTemplateNameForWorker(value);

  return (
    <fieldset
      className={className}
      disabled={disabled}
      data-onboarding-field={fieldId}
    >
      <legend className={labelClass}>
        State / Region
        {required ? <span className="text-orange-500"> *</span> : null}
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
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      <p className="mt-2 text-xs text-slate-500">
        {assignedPayRule
          ? `Pay rule assigned automatically: ${assignedPayRule}`
          : "Pay rule is assigned automatically from state/region (NSW, ACT, WA, or NZ)."}
      </p>
    </fieldset>
  );
}
