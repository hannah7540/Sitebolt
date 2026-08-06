"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FormEvent, MouseEvent } from "react";
import { Loader2, Plus, Save, X } from "lucide-react";
import PayRuleConditionRow from "@/components/accounts/PayRuleConditionRow";
import {
  createEmptyConditionRow,
  createNswMealAllowancePresetRow,
  mapConditionFormRowsToInput,
  sanitizePayRuleTemplateInput,
  templateToFormRows,
  type PayRuleConditionFormRow,
  type PayRuleTemplate,
  type PayRuleTemplateInput,
  type WeekdayCode,
} from "@/lib/pay-rule-templates";
import { inputClass, labelClass } from "@/lib/ui-classes";

export interface PayRuleModalProps {
  template: PayRuleTemplate | null;
  isOpen: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (input: PayRuleTemplateInput) => void;
}

function buildFormRows(template: PayRuleTemplate | null): PayRuleConditionFormRow[] {
  return template ? templateToFormRows(template) : [createEmptyConditionRow()];
}

function PayRuleModal({
  template,
  isOpen,
  saving,
  onClose,
  onSave,
}: PayRuleModalProps) {
  const [templateName, setTemplateName] = useState("");
  const [rows, setRows] = useState<PayRuleConditionFormRow[]>([]);
  const [mounted, setMounted] = useState(false);
  const openSessionRef = useRef<string | null>(null);

  const isCreateMode = template === null;
  const title = isCreateMode ? "Add New Pay Rule" : "Edit Pay Rule Template";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      openSessionRef.current = null;
      return;
    }

    const sessionKey = template?.id ?? "create-new";
    if (openSessionRef.current === sessionKey) return;

    openSessionRef.current = sessionKey;
    setTemplateName(template?.name ?? "");
    setRows(buildFormRows(template));
  }, [isOpen, template]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (!saving) onClose();
  };

  const stopDialogBubble = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const handleRowChange = useCallback(
    (clientId: string, patch: Partial<PayRuleConditionFormRow>) => {
      setRows((current) =>
        current.map((row) => (row.clientId === clientId ? { ...row, ...patch } : row))
      );
    },
    []
  );

  const handleRowToggleDay = useCallback((clientId: string, day: WeekdayCode) => {
    setRows((current) =>
      current.map((row) => {
        if (row.clientId !== clientId) return row;
        const hasDay = row.applicableDays.includes(day);
        return {
          ...row,
          applicableDays: hasDay
            ? row.applicableDays.filter((value) => value !== day)
            : [...row.applicableDays, day],
        };
      })
    );
  }, []);

  const handleRowRemove = useCallback((clientId: string) => {
    setRows((current) => current.filter((row) => row.clientId !== clientId));
  }, []);

  const handleAddMealPreset = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setRows((current) => [...current, createNswMealAllowancePresetRow()]);
  };

  const handleAddCondition = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setRows((current) => [...current, createEmptyConditionRow()]);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = sanitizePayRuleTemplateInput({
      name: templateName,
      conditions: mapConditionFormRowsToInput(rows),
    });
    onSave(input);
  };

  if (!mounted || !isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={stopDialogBubble}
        onMouseDown={stopDialogBubble}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pay-rule-modal-title"
      >
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit} noValidate>
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4">
            <div>
              <h3 id="pay-rule-modal-title" className="text-lg font-bold text-slate-900">
                {title}
              </h3>
              <p className="mt-0.5 text-sm text-slate-500">
                Build pay rates and worker allowances with triggers and payout units.
              </p>
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                onClose();
              }}
              disabled={saving}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-5 overflow-y-auto px-6 py-4">
            <label className="block space-y-1">
              <span className={labelClass}>Template Name</span>
              <input
                type="text"
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                placeholder="WA Site Worker"
                className={inputClass}
              />
            </label>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-slate-900">Rule Conditions</h4>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleAddMealPreset}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    NSW Meal Allowance (10+ hrs)
                  </button>
                  <button
                    type="button"
                    onClick={handleAddCondition}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-800 hover:bg-orange-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Rule Condition
                  </button>
                </div>
              </div>

              {rows.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                  No conditions yet. Add your first rule condition.
                </p>
              ) : (
                rows.map((row, index) => (
                  <PayRuleConditionRow
                    key={row.clientId}
                    row={row}
                    index={index}
                    onRowChange={handleRowChange}
                    onRowToggleDay={handleRowToggleDay}
                    onRowRemove={handleRowRemove}
                  />
                ))
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                onClose();
              }}
              disabled={saving}
              className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Pay Rule
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export default memo(PayRuleModal);
