"use client";

import { useEffect, useState } from "react";
import {
  fetchPayRulesForAssignment,
  type PayRuleAssignmentOption,
} from "@/lib/pay-rules-assignment";
import { inputClass, labelClass } from "@/lib/ui-classes";

interface AssignPayRuleSelectProps {
  value: string | null;
  onChange: (payRuleId: string | null) => void;
  disabled?: boolean;
  id?: string;
}

export default function AssignPayRuleSelect({
  value,
  onChange,
  disabled = false,
  id = "assign-pay-rule",
}: AssignPayRuleSelectProps) {
  const [rules, setRules] = useState<PayRuleAssignmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setLoadError(null);

      try {
        const { rules: rows, error } = await fetchPayRulesForAssignment();
        if (cancelled) return;
        if (error) {
          console.error("[AssignPayRuleSelect] pay_rules fetch error:", error);
        }
        setRules(rows);
        setLoadError(error);
      } catch (cause) {
        if (cancelled) return;
        setRules([]);
        setLoadError(
          cause instanceof Error ? cause.message : "Failed to load pay rules."
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const emptyLabel = loading
    ? "Loading pay rules…"
    : rules.length > 0
      ? "No pay rule assigned"
      : "No pay rules configured";

  return (
    <label className="block space-y-1" htmlFor={id}>
      <span className={labelClass}>Assign Pay Rule</span>
      <select
        id={id}
        className={inputClass}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value.trim() || null)}
        disabled={disabled || loading}
      >
        <option value="">{emptyLabel}</option>
        {rules.map((rule) => (
          <option key={rule.id} value={rule.id}>
            {rule.displayName}
          </option>
        ))}
      </select>
      {loadError && !loading ? (
        <p className="text-xs text-amber-700">{loadError}</p>
      ) : null}
    </label>
  );
}
