"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import {
  getWorkerFinancialDetails,
  updateWorkerFinancialDetails,
} from "@/app/actions/update-worker-financials";
import type { Worker } from "@/lib/supabase";
import { formatWorkerBsb } from "@/lib/worker-utils";
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
  workerId: string;
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

function nullIfBlank(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export default function WorkerFinancialEditModal({
  workerId,
  worker,
  onClose,
  onSaved,
}: WorkerFinancialEditModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [bankName, setBankName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [bankBsb, setBankBsb] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [superFund, setSuperFund] = useState("");
  const [superMemberNumber, setSuperMemberNumber] = useState("");
  const [tfn, setTfn] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void getWorkerFinancialDetails(workerId).then((result) => {
      if (cancelled) return;
      if (result.error || !result.values) {
        setError(result.error ?? "Failed to load financial details.");
        setLoading(false);
        return;
      }

      setBankName(result.values.bank_name ?? "");
      setAccountName(result.values.bank_account_name ?? "");
      setBankBsb(result.values.bank_bsb ?? "");
      setBankAccountNumber(result.values.bank_account_number ?? "");
      setSuperFund(result.values.super_fund ?? "");
      setSuperMemberNumber(result.values.super_member_number ?? "");
      setTfn(result.values.tfn ?? "");
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [workerId]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await updateWorkerFinancialDetails({
        workerId,
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
      router.refresh();
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
    <div
      className={modalOverlayClass}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-financials-title"
    >
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
            View & Edit Financial Details
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Payroll details are loaded securely here and are not shown on the dashboard.
          </p>

          {error ? (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
          ) : null}

          {loading ? (
            <div className="mt-6 flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
              Loading financial details…
            </div>
          ) : (
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
          )}
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
              disabled={saving || loading}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                "Save"
              )}
            </button>
          </div>
        </ModalActionFooter>
      </div>
    </div>
  );
}
