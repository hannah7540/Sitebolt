"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Pencil } from "lucide-react";
import type { Worker } from "@/lib/supabase";
import {
  getWorkerDisplayName,
  maskWorkerAccountNumber,
  maskWorkerBsb,
  maskWorkerTaxFileNumber,
} from "@/lib/worker-utils";
import { sectionClass } from "@/lib/ui-classes";
import WorkerFinancialEditModal from "./WorkerFinancialEditModal";

interface WorkerFinancialInfoSectionProps {
  worker: Worker;
  onSaved: (worker: Worker) => void;
  compact?: boolean;
}

function DisplayRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}

export default function WorkerFinancialInfoSection({
  worker,
  onSaved,
  compact = false,
}: WorkerFinancialInfoSectionProps) {
  const [editing, setEditing] = useState(false);
  const accountName =
    worker.bank_account_name?.trim() || getWorkerDisplayName(worker) || "—";

  return (
    <div className={compact ? "space-y-3" : sectionClass}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-orange-600">Financial Information</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Account number, BSB, and TFN are masked. Use Edit Financials to change them.
          </p>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setEditing(true);
          }}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-100"
        >
          <Pencil className="h-3 w-3" />
          Edit Financials
        </button>
      </div>

      <dl className="space-y-1.5">
        <DisplayRow label="Bank Name" value={worker.bank_name?.trim() || "—"} />
        <DisplayRow label="Account Name" value={accountName} />
        <DisplayRow label="BSB" value={maskWorkerBsb(worker.bank_bsb) ?? "—"} />
        <DisplayRow
          label="Account Number"
          value={maskWorkerAccountNumber(worker.bank_account_number) ?? "—"}
        />
        <DisplayRow
          label="Superannuation"
          value={worker.super_fund?.trim() || "—"}
        />
        <DisplayRow
          label="Super Member No."
          value={maskWorkerAccountNumber(worker.super_member_number) ?? "—"}
        />
        <DisplayRow label="TFN" value={maskWorkerTaxFileNumber(worker.tfn) ?? "—"} />
      </dl>

      {editing && typeof document !== "undefined"
        ? createPortal(
            <WorkerFinancialEditModal
              worker={worker}
              onClose={() => setEditing(false)}
              onSaved={(updated) => {
                onSaved(updated);
                setEditing(false);
              }}
            />,
            document.body
          )
        : null}
    </div>
  );
}
