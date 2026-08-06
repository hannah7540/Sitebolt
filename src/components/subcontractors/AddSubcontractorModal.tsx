"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { insertSubcontractor } from "@/lib/subcontractors";
import { modalOverlayClass, modalClass, inputClass, labelClass } from "@/lib/ui-classes";

interface AddSubcontractorModalProps {
  onClose: () => void;
  onSaved: (subcontractorId: string) => void;
}

export default function AddSubcontractorModal({
  onClose,
  onSaved,
}: AddSubcontractorModalProps) {
  const [companyName, setCompanyName] = useState("");
  const [abn, setAbn] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [tradeType, setTradeType] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
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
    const { error: saveError, id } = await insertSubcontractor({
      companyName: companyName ?? "",
      abn: abn ?? "",
      contactName: contactName ?? "",
      contactPerson: contactName ?? "",
      contactEmail: contactEmail ?? "",
      email: contactEmail ?? "",
      contactPhone: contactPhone ?? "",
      phone: contactPhone ?? "",
      tradeType: tradeType ?? "",
      tradeCategory: tradeType ?? "",
      trade: tradeType ?? "",
      address: address ?? "",
      notes: notes ?? "",
    });
    setSaving(false);
    if (saveError || !id) {
      setError(saveError ?? "Failed to save subcontractor.");
      return;
    }
    onSaved(id);
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
            <h2 className="text-lg font-bold text-slate-900">Add New Subcontractor</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Register a subcontractor company on SiteBolt.
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
              value={companyName ?? ""}
              onChange={(e) => setCompanyName(e.target.value)}
              required
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className={labelClass}>ABN</span>
              <input className={inputClass} value={abn ?? ""} onChange={(e) => setAbn(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Trade type</span>
              <input
                className={inputClass}
                value={tradeType ?? ""}
                onChange={(e) => setTradeType(e.target.value)}
                placeholder="e.g. Electrical"
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className={labelClass}>Contact name</span>
            <input
              className={inputClass}
              value={contactName ?? ""}
              onChange={(e) => setContactName(e.target.value)}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className={labelClass}>Contact email</span>
              <input
                type="email"
                className={inputClass}
                value={contactEmail ?? ""}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Contact phone</span>
              <input
                className={inputClass}
                value={contactPhone ?? ""}
                onChange={(e) => setContactPhone(e.target.value)}
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className={labelClass}>Address</span>
            <input
              className={inputClass}
              value={address ?? ""}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>Notes</span>
            <textarea
              className={`${inputClass} min-h-[72px] resize-y`}
              value={notes ?? ""}
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
              Save Subcontractor
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
