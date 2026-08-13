"use client";

import {
  SECURITY_ROLES,
  SECURITY_ROLE_LABELS,
  SECURITY_ROLE_DESCRIPTIONS,
  normalizeSecurityRole,
  type SecurityRole,
} from "@/lib/security-roles";
import { inputClass, labelClass } from "@/lib/ui-classes";

interface WorkerSecurityRoleSelectProps {
  id?: string;
  value: SecurityRole | string | null | undefined;
  onChange: (role: SecurityRole) => void;
  disabled?: boolean;
  showDescription?: boolean;
}

export default function WorkerSecurityRoleSelect({
  id = "worker-security-role",
  value,
  onChange,
  disabled = false,
  showDescription = true,
}: WorkerSecurityRoleSelectProps) {
  const normalized = normalizeSecurityRole(value);

  return (
    <label className="block space-y-1">
      <span className={labelClass}>Security role</span>
      <select
        id={id}
        className={inputClass}
        value={normalized}
        onChange={(event) => onChange(normalizeSecurityRole(event.target.value))}
        disabled={disabled}
      >
        {SECURITY_ROLES.map((role) => (
          <option key={role} value={role}>
            {SECURITY_ROLE_LABELS[role]}
          </option>
        ))}
      </select>
      {showDescription ? (
        <p className="text-xs text-slate-500">{SECURITY_ROLE_DESCRIPTIONS[normalized]}</p>
      ) : null}
    </label>
  );
}
