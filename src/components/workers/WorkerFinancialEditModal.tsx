"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";
import { updateWorkerFinancialDetails } from "@/app/actions/update-worker-financials";
import type { Worker } from "@/lib/supabase";
import { formatWorkerBsb, getWorkerDisplayName } from "@/lib/worker-utils";
import { cn } from "@/lib/utils";
import {
  inputClass,
  labelClass,
  modalBodyClass,
  modalCloseIconButtonClass,
  modalOverlayClass,
  modalShellClass,
} from "@/lib/ui-classes";
import ModalActionFooter from "@/components/ui/ModalActionFooter";

interface WorkerFinancialEditModalProps {
  worker: Worker;
  onClose: () => void;
  onSaved: (worker: Worker) => void;
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1" htmlFor={htmlFor}>
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

export default function WorkerFinancialEditModal({
  worker,
  onClose,
  onSaved,
}: WorkerFinancialEditModalProps) {
  const [bankName, setBankName] = useState(worker.bank_name ?? "");
  const [accountName, setAccountName] = useState(
    worker.bank_account_name ?? getWorkerDisplayName(worker)
  );
  const [bankBsb, setBankBsb] = useState(worker.bank_bsb ?? "");
  const [bankAccountNumber, setBankAccountNumber] = useState(
    worker.bank_account_number ?? ""
  );
  const [superFund, setSuperFund] = useState(worker.super_fund ?? "");
  const [superMemberNumber, setSuperMemberNumber] = useState(
    worker.super_member_number ?? ""
  );
  const [tfn, setTfn] = useState(worker.tfn ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBankName(worker.bank_name ?? "");
    setAccountName(worker.bank_account_name ?? getWorkerDisplayName(worker));
    setBankBsb(worker.bank_bsb ?? "");
    setBankAccountNumber(worker.bank_account_number ?? "");
    setSuperFund(worker.super_fund ?? "");
    setSuperMemberNumber(worker.super_member_number ?? "");
    setTfn(worker.tfn ?? "");
    setError(null);
  }, [worker]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await updateWorkerFinancialDetails({
        workerId: worker.id,
        bankName,
        accountName,
        bankBsb,
        bankAccountNumber,
        superFund,
        superMemberNumber,
        tfn,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      onSaved({
        ...worker,
        bank_name: result.values?.bank_name ?? nullIfBlank(bankName),
        bank_account_name: result.values?.bank_account_name ?? nullIfBlank(accountName),
        bank_bsb: result.values?.bank_bsb ?? formatWorkerBsb(bankBsb),
        bank_account_number:
          result.values?.bank_account_number ?? nullIfBlank(bankAccountNumber),
        super_fund: result.values?.super_fund ?? nullIfBlank(superFund),
        super_member_number:
          result.values?.super_member_number ?? nullIfBlank(superMemberNumber),
        tfn: result.values?.tfn ?? nullIfBlank(tfn),
      });
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Failed to save financial details."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={modalOverlayClass} role="dialog" aria-modal="true" aria-labelledby="edit-financials-title">
      <div className={cn(modalShellClass, "max-w-lg")}>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className={cn(modalCloseIconButtonClass, "absolute right-3 top-3 z-20")}
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className={cn(modalBodyClass, "pt-10")}>
          <h2 id="edit-financials-title" className="text-xl font-bold text-slate-900">
            Edit Financials
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Update the same payroll details collected during onboarding.
          </p>

          {error ? (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
          ) : null}

          <div className="mt-4 space-y-3">
            <Field label="Bank Name" htmlFor="financial-bank-name">
              <input
                id="financial-bank-name"
                className={inputClass}
                value={bankName}
                onChange={(event) => setBankName(event.target.value)}
                autoComplete="off"
              />
            </Field>
            <Field label="Account Name" htmlFor="financial-account-name">
              <input
                id="financial-account-name"
                className={inputClass}
                value={accountName}
                onChange={(event) => setAccountName(event.target.value)}
                autoComplete="off"
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="BSB" htmlFor="financial-bsb">
                <input
                  id="financial-bsb"
                  className={inputClass}
                  value={bankBsb}
                  onChange={(event) => setBankBsb(event.target.value)}
                  onBlur={() => {
                    const formatted = formatWorkerBsb(bankBsb);
                    if (formatted) setBankBsb(formatted);
                  }}
                  inputMode="numeric"
                  placeholder="000-000"
                  autoComplete="off"
                />
              </Field>
              <Field label="Account Number" htmlFor="financial-account-number">
                <input
                  id="financial-account-number"
                  className={inputClass}
                  value={bankAccountNumber}
                  onChange={(event) => setBankAccountNumber(event.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                />
              </Field>
            </div>
            <Field label="Superannuation Fund Name" htmlFor="financial-super-fund">
              <input
                id="financial-super-fund"
                className={inputClass}
                value={superFund}
                onChange={(event) => setSuperFund(event.target.value)}
              />
            </Field>
            <Field label="Super Member Number" htmlFor="financial-super-member">
              <input
                id="financial-super-member"
                className={inputClass}
                value={superMemberNumber}
                onChange={(event) => setSuperMemberNumber(event.target.value)}
                autoComplete="off"
              />
            </Field>
            <Field label="Tax File Number (TFN)" htmlFor="financial-tfn">
              <input
                id="financial-tfn"
                className={inputClass}
                value={tfn}
                onChange={(event) => setTfn(event.target.value)}
                autoComplete="off"
              />
            </Field>
          </div>
        </div>

        <ModalActionFooter>
          <div className="flex gap-3 pb-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex min-h-11 flex-1 items-center justify-center rounded-lg bg-slate-100 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                "Save financials"
              )}
            </button>
          </div>
        </ModalActionFooter>
      </div>
    </div>
  );
}

function nullIfBlank(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
