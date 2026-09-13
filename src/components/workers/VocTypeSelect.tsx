"use client";

import {
  VOC_OTHER_LABEL,
  VOC_OTHER_UNSPECIFIED_ERROR,
  VOC_TYPE_OPTIONS,
  formatVocOtherStoredValue,
  getVocSelectValue,
  isVocOtherType,
  parseVocOtherCustomName,
} from "@/lib/voc-utils";
import { inputClass, labelClass } from "@/lib/ui-classes";

interface VocTypeSelectProps {
  value: string;
  onChange: (storedValue: string) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string | null;
}

export default function VocTypeSelect({
  value,
  onChange,
  required = true,
  disabled = false,
  error = null,
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
        <span className={labelClass}>VOC Type{required ? " *" : ""}</span>
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
