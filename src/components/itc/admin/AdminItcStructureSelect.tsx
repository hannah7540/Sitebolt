"use client";

import { inputClass } from "@/lib/ui-classes";

interface AdminItcStructureSelectProps {
  id: string;
  label: string;
  value: string;
  options: string[];
  placeholder?: string;
  onChange: (value: string) => void;
}

/** Creatable combobox: pick an existing structure label or type a new one. */
export default function AdminItcStructureSelect({
  id,
  label,
  value,
  options,
  placeholder,
  onChange,
}: AdminItcStructureSelectProps) {
  const listId = `${id}-options`;
  return (
    <label htmlFor={id}>
      <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
        {label}
      </span>
      <input
        id={id}
        list={listId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
        placeholder={placeholder}
        autoComplete="off"
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </label>
  );
}
