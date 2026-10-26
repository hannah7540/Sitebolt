"use client";

import {
  VOC_OTHER_LABEL,
  VOC_OTHER_UNSPECIFIED_ERROR,
  VOC_TYPE_OPTIONS,
  formatVocDisplayLabel,
  formatVocOtherStoredValue,
  getVocSelectValue,
  isVocOtherType,
  normalizeSecondaryVocs,
  parseVocOtherCustomName,
} from "@/lib/voc-utils";
import { inputClass, labelClass } from "@/lib/ui-classes";

interface VocTypeSelectProps {
  value: string;
  onChange: (storedValue: string) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string | null;
  label?: string;
}

export default function VocTypeSelect({
  value,
  onChange,
  required = true,
  disabled = false,
  error = null,
  label = "VOC Type",
}: VocTypeSelectProps) {
  const selectValue = getVocSelectValue(value);
  const customName = parseVocOtherCustomName(value);
  const isOther = selectValue === VOC_OTHER_LABEL;
  const isLegacyCustom =
    Boolean(value.trim()) &&
    !isVocOtherType(value) &&
    !VOC_TYPE_OPTIONS.includes(value as (typeof VOC_TYPE_OPTIONS)[number]);
  const specifyError =
    error ??
    (isOther && required && !customName.trim() ? VOC_OTHER_UNSPECIFIED_ERROR : null);

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className={labelClass}>
          {label}
          {required ? " *" : ""}
        </span>
        <select
          className={inputClass}
          value={selectValue}
          required={required}
          disabled={disabled}
          onChange={(event) => {
            const next = event.target.value;
            if (next === VOC_OTHER_LABEL) {
              onChange(VOC_OTHER_LABEL);
              return;
            }
            onChange(next);
          }}
        >
          <option value="">Select VOC type…</option>
          {VOC_TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          <option value={VOC_OTHER_LABEL}>{VOC_OTHER_LABEL}</option>
          {isLegacyCustom ? <option value={value}>{value}</option> : null}
        </select>
      </label>

      {isOther ? (
        <label className="block space-y-1">
          <span className={labelClass}>Specify VOC Type *</span>
          <input
            className={inputClass}
            value={customName}
            required
            disabled={disabled}
            placeholder="e.g., Skid Steer, Articulated Dump Truck"
            onChange={(event) => onChange(formatVocOtherStoredValue(event.target.value))}
          />
          {specifyError ? <p className="text-xs text-red-600">{specifyError}</p> : null}
        </label>
      ) : null}
    </div>
  );
}

export function VocSecondarySelect({
  primaryVoc,
  value,
  onChange,
  disabled = false,
}: {
  primaryVoc: string;
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const selected = normalizeSecondaryVocs(value, primaryVoc);
  const options = VOC_TYPE_OPTIONS.filter((option) => option !== primaryVoc);

  const toggle = (option: string) => {
    if (disabled) return;
    if (selected.includes(option)) {
      onChange(selected.filter((item) => item !== option));
      return;
    }
    onChange([...selected, option]);
  };

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className={labelClass}>Secondary VOCs included on this card</legend>
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((item) => (
            <button
              key={item}
              type="button"
              disabled={disabled}
              onClick={() => toggle(item)}
              className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-xs font-semibold text-orange-800 hover:bg-orange-100 disabled:opacity-60"
            >
              {formatVocDisplayLabel(item)}
              <span className="ml-1 text-orange-500">×</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          Optional. Select every extra competency printed on the same card.
        </p>
      )}
      <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
        {options.map((option) => {
          const checked = selected.includes(option);
          return (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(option)}
              />
              <span>{option}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
