"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  coerceSubcontractor,
  updateSubcontractor,
  type Subcontractor,
} from "@/lib/subcontractors";
import { modalOverlayClass, modalClass, inputClass, labelClass } from "@/lib/ui-classes";

interface EditSubcontractorModalProps {
  subcontractor: Subcontractor;
  onClose: () => void;
  onSaved: (updated: Subcontractor) => void;
}

export default function EditSubcontractorModal({
  subcontractor,
  onClose,
  onSaved,
}: EditSubcontractorModalProps) {
  const subbie = coerceSubcontractor(subcontractor);
  const [companyName, setCompanyName] = useState(subbie.company_name);
  const [abn, setAbn] = useState(subbie.abn);
  const [contactName, setContactName] = useState(subbie.contact_name);
  const [contactEmail, setContactEmail] = useState(subbie.contact_email);
  const [contactPhone, setContactPhone] = useState(subbie.contact_phone);
  const [tradeType, setTradeType] = useState(subbie.trade_type);
  const [address, setAddress] = useState(subbie.address);
  const [notes, setNotes] = useState(subbie.notes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      setError("Company name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: saveError } = await updateSubcontractor({
      id: subbie.id,
      companyName,
      abn,
      contactName,
      contactPerson: contactName,
      contactEmail,
      email: contactEmail,
      contactPhone,
      phone: contactPhone,
      tradeType,
      tradeCategory: tradeType,
      trade: tradeType,
      address,
      notes,
    });
    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    onSaved(
      coerceSubcontractor({
        ...subbie,
        company_name: companyName.trim(),
        abn,
        contact_name: contactName,
        contact_person: contactName,
        contact_email: contactEmail,
        email: contactEmail,
        contact_phone: contactPhone,
        phone: contactPhone,
        address,
        trade_type: tradeType,
        trade_category: tradeType,
        trade: tradeType,
        notes,
      })
    );
    onClose();
  };

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={`${modalClass} max-w-lg`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Edit Company Details</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Update subcontractor company information.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block space-y-1">
            <span className={labelClass}>Company name *</span>
            <input
              className={inputClass}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className={labelClass}>ABN</span>
              <input className={inputClass} value={abn} onChange={(e) => setAbn(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Trade scope</span>
              <input
                className={inputClass}
                value={tradeType}
                onChange={(e) => setTradeType(e.target.value)}
                placeholder="e.g. Electrical"
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className={labelClass}>Primary contact name</span>
            <input
              className={inputClass}
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className={labelClass}>Contact email</span>
              <input
                type="email"
                className={inputClass}
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Contact phone</span>
              <input
                className={inputClass}
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className={labelClass}>Company address</span>
            <input
              className={inputClass}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>Notes</span>
            <textarea
              className={`${inputClass} min-h-[72px] resize-y`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
