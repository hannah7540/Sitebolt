"use client";

import CameraCaptureInput from "./CameraCaptureInput";
import {
  CLIENT_OPTIONS,
  type SiteFormData,
  type SiteFormFieldDef,
  type SiteFormFieldValue,
} from "@/lib/site-forms";
import { inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

function FieldWrap({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className={labelClass}>
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}

function toggleMultiValue(current: string[], option: string): string[] {
  return current.includes(option)
    ? current.filter((item) => item !== option)
    : [...current, option];
}

interface SiteFormFieldInputProps {
  field: SiteFormFieldDef;
  formData: SiteFormData;
  onChange: (fieldId: string, value: SiteFormFieldValue) => void;
  photoFiles: Record<string, File | null>;
  onPhotoCapture: (photoFieldId: string, file: File | null) => void;
}

export default function SiteFormFieldInput({
  field,
  formData,
  onChange,
  photoFiles,
  onPhotoCapture,
}: SiteFormFieldInputProps) {
  const value = formData[field.id];
  const otherValue =
    field.otherFieldId && typeof formData[field.otherFieldId] === "string"
      ? (formData[field.otherFieldId] as string)
      : "";
  const selectedMulti = Array.isArray(value) ? value : [];
  const otherSelected = selectedMulti.includes("Other");

  if (field.type === "client_select") {
    return (
      <FieldWrap label={field.label} required={field.required}>
        <div className="flex flex-wrap gap-4">
          {CLIENT_OPTIONS.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-2 text-sm text-slate-800"
            >
              <input
                type="radio"
                name={field.id}
                checked={value === option}
                onChange={() => onChange(field.id, option)}
                className="border-slate-300 text-orange-500 focus:ring-orange-500"
                required={field.required}
              />
              {option}
            </label>
          ))}
        </div>
      </FieldWrap>
    );
  }

  if (field.type === "multi_select" || field.type === "multi_select_other") {
    return (
      <div className="space-y-2">
        <FieldWrap label={field.label} required={field.required}>
          <div className="grid gap-2 sm:grid-cols-2">
            {(field.options ?? []).map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
              >
                <input
                  type="checkbox"
                  checked={selectedMulti.includes(option)}
                  onChange={() =>
                    onChange(field.id, toggleMultiValue(selectedMulti, option))
                  }
                  className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                />
                {option}
              </label>
            ))}
          </div>
        </FieldWrap>
        {field.type === "multi_select_other" && otherSelected && field.otherFieldId && (
          <FieldWrap label={`${field.label} — other (specify)`} required>
            <input
              className={inputClass}
              value={otherValue}
              onChange={(e) => onChange(field.otherFieldId!, e.target.value)}
              placeholder="Please specify…"
              required
            />
          </FieldWrap>
        )}
      </div>
    );
  }

  if (field.type === "yes_no_na") {
    const triValue = typeof value === "string" ? value : "";
    return (
      <FieldWrap label={field.label} required={field.required}>
        <div className="flex flex-wrap gap-4">
          {(["yes", "no", "na"] as const).map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-2 text-sm text-slate-800"
            >
              <input
                type="radio"
                name={field.id}
                checked={triValue === option}
                onChange={() => onChange(field.id, option)}
                className="border-slate-300 text-orange-500 focus:ring-orange-500"
                required={field.required}
              />
              {option === "na" ? "N/A" : option === "yes" ? "Yes" : "No"}
            </label>
          ))}
        </div>
      </FieldWrap>
    );
  }

  if (field.type === "yes_na") {
    const ynValue = typeof value === "string" ? value : "";
    return (
      <FieldWrap label={field.label} required={field.required}>
        <div className="flex flex-wrap gap-4">
          {(["yes", "na"] as const).map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-2 text-sm text-slate-800"
            >
              <input
                type="radio"
                name={field.id}
                checked={ynValue === option}
                onChange={() => onChange(field.id, option)}
                className="border-slate-300 text-orange-500 focus:ring-orange-500"
                required={field.required}
              />
              {option === "na" ? "N/A" : "Yes"}
            </label>
          ))}
        </div>
      </FieldWrap>
    );
  }

  if (field.type === "yes_no") {
    return (
      <FieldWrap label={field.label} required={field.required}>
        <select
          className={inputClass}
          value={value === true ? "yes" : value === false ? "no" : ""}
          onChange={(e) => {
            if (e.target.value === "yes") onChange(field.id, true);
            else if (e.target.value === "no") onChange(field.id, false);
          }}
          required={field.required}
        >
          <option value="">Select…</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </FieldWrap>
    );
  }

  if (field.type === "textarea") {
    return (
      <FieldWrap label={field.label} required={field.required}>
        <textarea
          className={cn(inputClass, "min-h-[88px] resize-y")}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(field.id, e.target.value)}
          placeholder={field.placeholder}
          required={field.required}
        />
      </FieldWrap>
    );
  }

  if (field.type === "tri_state_with_photo" || field.type === "yes_no_with_photo") {
    const triValue = typeof value === "string" ? value : "";
    const options =
      field.type === "tri_state_with_photo"
        ? (["yes", "no", "na"] as const)
        : (["yes", "no"] as const);

    return (
      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
        <FieldWrap label={field.label} required={field.required}>
          <div className="flex flex-wrap gap-4">
            {options.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2 text-sm text-slate-800"
              >
                <input
                  type="radio"
                  name={field.id}
                  checked={triValue === option}
                  onChange={() => onChange(field.id, option)}
                  className="border-slate-300 text-orange-500 focus:ring-orange-500"
                  required={field.required}
                />
                {option === "na" ? "N/A" : option === "yes" ? "Yes" : "No"}
              </label>
            ))}
          </div>
        </FieldWrap>
        {field.photoFieldId && (
          <CameraCaptureInput
            label="Photo evidence *"
            onCapture={(file) => onPhotoCapture(field.photoFieldId!, file)}
          />
        )}
        {field.photoFieldId && photoFiles[field.photoFieldId] && (
          <p className="text-xs text-emerald-700">Photo captured.</p>
        )}
      </div>
    );
  }

  return (
    <FieldWrap label={field.label} required={field.required}>
      <input
        className={inputClass}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(field.id, e.target.value)}
        placeholder={field.placeholder}
        required={field.required}
      />
    </FieldWrap>
  );
}
