"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import ModalActionFooter from "@/components/ui/ModalActionFooter";
import type { SupplierAccount, SupplierAccountInput } from "@/lib/supplier-accounts";
import { SUPPLIER_ACCOUNT_STATES } from "@/lib/supplier-accounts";
import { cn } from "@/lib/utils";
import {
  inputClass,
  labelClass,
  modalBodyClass,
  modalCloseIconButtonClass,
  modalOverlayClass,
  modalShellClass,
} from "@/lib/ui-classes";

interface SupplierAccountFormModalProps {
  account?: SupplierAccount | null;
  onClose: () => void;
  onSave: (input: SupplierAccountInput) => Promise<{ error: string | null }>;
}

export default function SupplierAccountFormModal({
  account,
  onClose,
  onSave,
}: SupplierAccountFormModalProps) {
  const isEditing = Boolean(account?.id);
  const [name, setName] = useState(account?.name ?? "");
  const [contactPerson, setContactPerson] = useState(account?.contact_person ?? "");
  const [email, setEmail] = useState(account?.email ?? "");
  const [phone, setPhone] = useState(account?.phone ?? "");
  const [description, setDescription] = useState(account?.description ?? "");
  const [state, setState] = useState(account?.state ?? "");
  const [creditLimit, setCreditLimit] = useState(
    account?.credit_limit == null ? "" : String(account.credit_limit)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(account?.name ?? "");
    setContactPerson(account?.contact_person ?? "");
    setEmail(account?.email ?? "");
    setPhone(account?.phone ?? "");
    setDescription(account?.description ?? "");
    setState(account?.state ?? "");
    setCreditLimit(account?.credit_limit == null ? "" : String(account.credit_limit));
    setError(null);
  }, [account]);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const { error: saveError } = await onSave({
        name,
        contact_person: contactPerson,
        email,
        phone,
        description,
        state,
        credit_limit: creditLimit,
      });
      if (saveError) {
        setError(saveError);
        return;
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={modalOverlayClass}
      role="dialog"
      aria-modal="true"
      aria-labelledby="supplier-account-form-title"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className={cn(modalShellClass, "max-w-lg")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <h2 id="supplier-account-form-title" className="text-lg font-bold text-slate-900">
            {isEditing ? "Edit Supplier" : "Add New Supplier"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className={modalCloseIconButtonClass}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={cn(modalBodyClass, "space-y-4")}>
          <div>
            <label className={labelClass} htmlFor="supplier-name">
              Name *
            </label>
            <input
              id="supplier-name"
              className={cn(inputClass, "mt-1")}
              value={name}
              autoFocus
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Reece Plumbing"
              disabled={saving}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="supplier-contact-person">
              Contact Person
            </label>
            <input
              id="supplier-contact-person"
              className={cn(inputClass, "mt-1")}
              value={contactPerson}
              onChange={(event) => setContactPerson(event.target.value)}
              placeholder="Account manager"
              disabled={saving}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="supplier-email">
                Email
              </label>
              <input
                id="supplier-email"
                type="email"
                className={cn(inputClass, "mt-1")}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="accounts@supplier.com"
                disabled={saving}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="supplier-phone">
                Phone
              </label>
              <input
                id="supplier-phone"
                type="tel"
                className={cn(inputClass, "mt-1")}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="02 0000 0000"
                disabled={saving}
              />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="supplier-description">
              Description
            </label>
            <textarea
              id="supplier-description"
              className={cn(inputClass, "mt-1 min-h-[88px] resize-y")}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Brief description of services"
              disabled={saving}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="supplier-state">
                State *
              </label>
              <select
                id="supplier-state"
                className={cn(inputClass, "mt-1")}
                value={state}
                onChange={(event) => setState(event.target.value)}
                disabled={saving}
              >
                <option value="">Select state</option>
                {SUPPLIER_ACCOUNT_STATES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="supplier-credit-limit">
                Credit Limit
              </label>
              <input
                id="supplier-credit-limit"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                className={cn(inputClass, "mt-1")}
                value={creditLimit}
                onChange={(event) => setCreditLimit(event.target.value)}
                placeholder="Optional"
                disabled={saving}
              />
            </div>
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>

        <ModalActionFooter className="flex gap-2 px-6 pb-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isEditing ? "Save" : "Add Supplier"}
          </button>
        </ModalActionFooter>
      </div>
    </div>
  );
}
