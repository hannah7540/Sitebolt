"use client";

import { Trash2 } from "lucide-react";
import {
  ALLOWANCE_PAYOUT_OPTIONS,
  ALLOWANCE_TRIGGER_OPTIONS,
  CONDITION_TYPE_OPTIONS,
  MULTIPLIER_OPTIONS,
  TIME_CONDITION_OPTIONS,
  WEEKDAY_OPTIONS,
  type PayRuleConditionFormRow,
  type WeekdayCode,
} from "@/lib/pay-rule-templates";
import { inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface PayRuleConditionRowProps {
  row: PayRuleConditionFormRow;
  index: number;
  onRowChange: (clientId: string, patch: Partial<PayRuleConditionFormRow>) => void;
  onRowToggleDay: (clientId: string, day: WeekdayCode) => void;
  onRowRemove: (clientId: string) => void;
}

function needsPayRateHoursThreshold(
  timeCondition: PayRuleConditionFormRow["timeCondition"]
): boolean {
  return timeCondition === "first_n_hours" || timeCondition === "after_n_hours";
}

function needsAllowanceThreshold(
  trigger: PayRuleConditionFormRow["allowanceTrigger"]
): boolean {
  return trigger === "hours_gte_threshold";
}

export default function PayRuleConditionRow({
  row,
  index,
  onRowChange,
  onRowToggleDay,
  onRowRemove,
}: PayRuleConditionRowProps) {
  const isAllowance = row.conditionType === "allowance";
  const clientId = row.clientId;

  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        isAllowance
          ? "border-emerald-200 bg-emerald-50/50"
          : "border-slate-200 bg-slate-50"
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Condition {index + 1}
          {isAllowance ? " · Allowance" : " · Pay Rate"}
        </span>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            onRowRemove(clientId);
          }}
          className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
          aria-label="Remove condition row"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 sm:col-span-2">
          <span className={labelClass}>Type</span>
          <select
            value={row.conditionType}
            onChange={(event) =>
              onRowChange(clientId, {
                conditionType: event.target.value as PayRuleConditionFormRow["conditionType"],
              })
            }
            className={inputClass}
          >
            {CONDITION_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1 sm:col-span-2">
          <span className={labelClass}>
            {isAllowance ? "Allowance Name" : "Condition Name"}
          </span>
          <input
            type="text"
            value={row.conditionName}
            onChange={(event) => onRowChange(clientId, { conditionName: event.target.value })}
            placeholder={isAllowance ? "Meal Allowance NSW" : "Basic Pay"}
            className={inputClass}
          />
        </label>

        <div className="sm:col-span-2">
          <span className={labelClass}>Applicable Days</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {WEEKDAY_OPTIONS.map((day) => {
              const checked = row.applicableDays.includes(day.code);
              return (
                <label
                  key={day.code}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium",
                    checked
                      ? "border-orange-300 bg-orange-50 text-orange-800"
                      : "border-slate-200 bg-white text-slate-600"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onRowToggleDay(clientId, day.code)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                  />
                  {day.label}
                </label>
              );
            })}
          </div>
        </div>

        {isAllowance ? (
          <>
            <label className="block space-y-1 sm:col-span-2">
              <span className={labelClass}>Trigger Requirement</span>
              <select
                value={row.allowanceTrigger}
                onChange={(event) =>
                  onRowChange(clientId, {
                    allowanceTrigger: event.target
                      .value as PayRuleConditionFormRow["allowanceTrigger"],
                  })
                }
                className={inputClass}
              >
                {ALLOWANCE_TRIGGER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className={labelClass}>Threshold Hours</span>
              <input
                type="number"
                min={0}
                step={0.25}
                disabled={!needsAllowanceThreshold(row.allowanceTrigger)}
                value={row.hoursThreshold}
                onChange={(event) => onRowChange(clientId, { hoursThreshold: event.target.value })}
                className={cn(
                  inputClass,
                  !needsAllowanceThreshold(row.allowanceTrigger) && "opacity-50"
                )}
              />
            </label>

            <label className="block space-y-1">
              <span className={labelClass}>Payout Unit</span>
              <select
                value={row.payoutUnit}
                onChange={(event) =>
                  onRowChange(clientId, {
                    payoutUnit: event.target.value as PayRuleConditionFormRow["payoutUnit"],
                  })
                }
                className={inputClass}
              >
                {ALLOWANCE_PAYOUT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
            <label className="block space-y-1">
              <span className={labelClass}>Time Condition</span>
              <select
                value={row.timeCondition}
                onChange={(event) =>
                  onRowChange(clientId, {
                    timeCondition: event.target
                      .value as PayRuleConditionFormRow["timeCondition"],
                  })
                }
                className={inputClass}
              >
                {TIME_CONDITION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className={labelClass}>Hours Threshold</span>
              <input
                type="number"
                min={0}
                step={0.25}
                disabled={!needsPayRateHoursThreshold(row.timeCondition)}
                value={row.hoursThreshold}
                onChange={(event) => onRowChange(clientId, { hoursThreshold: event.target.value })}
                className={cn(
                  inputClass,
                  !needsPayRateHoursThreshold(row.timeCondition) && "opacity-50"
                )}
              />
            </label>

            <label className="block space-y-1 sm:col-span-2">
              <span className={labelClass}>Pay Multiplier / Type</span>
              <select
                value={row.payMultiplierType}
                onChange={(event) =>
                  onRowChange(clientId, {
                    payMultiplierType: event.target
                      .value as PayRuleConditionFormRow["payMultiplierType"],
                  })
                }
                className={inputClass}
              >
                {MULTIPLIER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
    </div>
  );
}
