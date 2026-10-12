"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { createHiredLabourWorker } from "@/lib/hired-labour";
import {
  inputClass,
  labelClass,
  modalBodyClass,
  modalOverlayClass,
  modalShellClass,
  modalStickyFooterClass,
} from "@/lib/ui-classes";

interface AddHiredLabourModalProps {
  onClose: () => void;
  onCreated: (workerId: string) => void;
}

export default function AddHiredLabourModal({
  onClose,
  onCreated,
}: AddHiredLabourModalProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await createHiredLabourWorker({
      firstName,
      lastName,
      email,
      phone,
    });
    setSubmitting(false);
    if (result.error || !result.workerId) {
      setError(result.error ?? "Unable to add hired labour.");
      return;
    }
    if (result.inviteError) {
      setError(`${result.inviteError} The worker was still saved.`);
    }
    onCreated(result.workerId);
    if (!result.inviteError) onClose();
  };

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={`${modalShellClass} max-w-lg`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Add New Hired Labour</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className={modalBodyClass + " space-y-4"}>
            {error ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {error}
              </p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={labelClass}>First name</span>
                <input
                  className={inputClass}
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  required
                />
              </label>
              <label className="block">
                <span className={labelClass}>Last name</span>
                <input
                  className={inputClass}
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  required
                />
              </label>
            </div>
            <label className="block">
              <span className={labelClass}>Email</span>
              <input
                type="email"
                className={inputClass}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className={labelClass}>Contact number</span>
              <input
                type="tel"
                className={inputClass}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                required
              />
            </label>
          </div>
          <div className={modalStickyFooterClass + " flex justify-end gap-2 pb-4"}>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save & send invite
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
