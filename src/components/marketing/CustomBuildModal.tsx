"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, X } from "lucide-react";
import SiteBoltMark from "@/components/marketing/SiteBoltMark";
import {
  CUSTOM_BUILD_MODULE_ID,
  SALES_ENQUIRY_STATE_OPTIONS,
  SALES_ENQUIRY_TEAM_SIZES,
} from "@/lib/sales-enquiry";
import { modalOverlayClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface CustomBuildModalProps {
  onClose: () => void;
}

const EMPTY_FORM = {
  fullName: "",
  companyName: "",
  workEmail: "",
  phone: "",
  state: "",
  teamSize: "",
  notes: "",
};

const fieldClass =
  "w-full rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 outline-none transition focus:border-[#FF6B00] focus:ring-2 focus:ring-[#FF6B00]/40";

export default function CustomBuildModal({ onClose }: CustomBuildModalProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setErrors({});

    try {
      const response = await fetch("/api/enquire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          enquiryType: "custom_build",
          modules: [CUSTOM_BUILD_MODULE_ID],
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        errors?: Record<string, string>;
      };

      if (!response.ok) {
        setErrors(payload.errors ?? {});
        setSubmitError(payload.error ?? "Unable to send your brief.");
        return;
      }

      setSuccess(true);
    } catch {
      setSubmitError("Unable to send your brief. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={modalOverlayClass} style={{ zIndex: 80 }}>
      <div className="relative flex max-h-[min(92dvh,100%)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-[#FF6B00]/40 bg-[#1F2429] shadow-[0_0_48px_rgba(255,107,0,0.22)] sm:max-h-[92vh] sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-white/10 bg-[#13171B] px-5 py-4">
          <div className="flex items-center gap-3">
            <SiteBoltMark className="h-9 w-9" />
            <div>
              <p className="text-[11px] font-extrabold tracking-[0.18em] text-[#FF6B00]">
                CUSTOM BUILD
              </p>
              <h2 className="text-lg font-bold text-white">
                {success ? "Brief received" : "Tell Us What You Need"}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {success ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
            <CheckCircle2 className="h-12 w-12 text-[#FF6B00]" />
            <p className="mt-4 text-lg font-bold text-white">
              Your custom build brief has been received.
            </p>
            <p className="mt-2 max-w-sm text-sm text-zinc-400">
              Our engineering lead will be in touch within 24 hours.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 rounded-lg bg-gradient-to-r from-[#FF6B00] to-[#FF8533] px-5 py-2.5 text-sm font-semibold text-white hover:from-[#FF8533] hover:to-[#FF6B00]"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="custom-name"
                label="Name"
                required
                error={errors.fullName}
                value={form.fullName}
                onChange={(value) => setForm((current) => ({ ...current, fullName: value }))}
              />
              <Field
                id="custom-company"
                label="Company Name"
                required
                error={errors.companyName}
                value={form.companyName}
                onChange={(value) => setForm((current) => ({ ...current, companyName: value }))}
              />
              <Field
                id="custom-email"
                label="Email"
                type="email"
                required
                error={errors.workEmail}
                value={form.workEmail}
                onChange={(value) => setForm((current) => ({ ...current, workEmail: value }))}
              />
              <Field
                id="custom-phone"
                label="Phone Number"
                type="tel"
                required
                error={errors.phone}
                value={form.phone}
                onChange={(value) => setForm((current) => ({ ...current, phone: value }))}
              />
            </div>

            <div className="mt-4">
              <label htmlFor="custom-state" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                State <span className="text-[#FF6B00]">*</span>
              </label>
              <select
                id="custom-state"
                required
                value={form.state}
                onChange={(event) =>
                  setForm((current) => ({ ...current, state: event.target.value }))
                }
                className={cn(fieldClass, "mt-1", errors.state && "border-red-400")}
              >
                <option value="">Select ACT, NSW, WA, or NZ</option>
                {SALES_ENQUIRY_STATE_OPTIONS.map((state) => (
                  <option key={state} value={state} className="bg-[#1F2429] text-white">
                    {state}
                  </option>
                ))}
              </select>
              {errors.state ? <p className="mt-1 text-xs text-red-400">{errors.state}</p> : null}
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Approximate team / fleet size
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {SALES_ENQUIRY_TEAM_SIZES.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, teamSize: size }))}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm font-semibold transition",
                      form.teamSize === size
                        ? "border-[#FF6B00] bg-[#FF6B00] text-white"
                        : "border-white/15 bg-white/[0.04] text-zinc-200 hover:border-[#FF6B00]"
                    )}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <label htmlFor="custom-notes" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Tell us what you want your software to do <span className="text-[#FF6B00]">*</span>
              </label>
              <textarea
                id="custom-notes"
                required
                rows={5}
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({ ...current, notes: event.target.value }))
                }
                placeholder="Describe your ideal workflows, forms, or pain points with existing apps..."
                className={cn(fieldClass, "mt-1 resize-y", errors.notes && "border-red-400")}
              />
              {errors.notes ? <p className="mt-1 text-xs text-red-400">{errors.notes}</p> : null}
            </div>

            {submitError ? <p className="mt-4 text-sm text-red-400">{submitError}</p> : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-white/15 px-4 py-3 text-sm font-semibold text-white hover:border-[#FF6B00]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#FF6B00] to-[#FF8533] py-3 text-sm font-semibold text-white shadow-[0_0_22px_rgba(255,107,0,0.4)] hover:from-[#FF8533] hover:to-[#FF6B00] disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Send custom build brief
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  error,
  required,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
        {label}
        {required ? <span className="text-[#FF6B00]"> *</span> : null}
      </label>
      <input
        id={id}
        type={type}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(fieldClass, "mt-1", error && "border-red-400")}
      />
      {error ? <p className="mt-1 text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
