"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { assignSwmsToGuest } from "@/app/actions/swms-guest";
import { isValidGuestEmail } from "@/lib/swms-guest";
import {
  inputClass,
  labelClass,
  modalClass,
  modalOverlayClass,
} from "@/lib/ui-classes";

interface SendSwmsToGuestModalProps {
  swmsId: string;
  swmsTitle: string;
  onClose: () => void;
  onSent?: () => void;
}

export default function SendSwmsToGuestModal({
  swmsId,
  swmsTitle,
  onClose,
  onSent,
}: SendSwmsToGuestModalProps) {
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!isValidGuestEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }

    setSaving(true);
    const result = await assignSwmsToGuest({
      swmsId,
      swmsTitle,
      guestEmail: email,
    });
    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setSuccess(`SWMS sent to ${email.trim().toLowerCase()}.`);
    onSent?.();
  };

  return (
    <div className={modalOverlayClass} onClick={() => !saving && onClose()}>
      <div
        className={`${modalClass} max-w-md`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Send to Guest</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Email a signing link for “{swmsTitle}” to someone without a SiteBolt
              account.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
          >
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        {success ? (
          <div className="space-y-4">
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {success}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
            <label className="block space-y-1">
              <span className={labelClass}>Guest email</span>
              <input
                type="email"
                className={inputClass}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="guest@example.com"
                autoComplete="email"
                required
              />
            </label>

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            ) : null}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Send email
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
