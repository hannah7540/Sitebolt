"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, X } from "lucide-react";
import {
  SALES_ENQUIRY_MODULES,
  SALES_ENQUIRY_STATE_OPTIONS,
  SALES_ENQUIRY_TEAM_SIZES,
} from "@/lib/sales-enquiry";
import { labelClass, modalOverlayClass } from "@/lib/ui-classes";

import SiteBoltMark from "@/components/marketing/SiteBoltMark";
import { cn } from "@/lib/utils";

interface EnquireNowModalProps {
  onClose: () => void;
}

const EMPTY_FORM = {
  fullName: "",
  companyName: "",
  workEmail: "",
  phone: "",
  state: "",
  teamSize: "",
  modules: [] as string[],
};

const fieldClass =
  "w-full rounded-lg border border-[#1F2429]/15 bg-[#F8FAFC] px-3 py-2 text-sm text-[#1F2429] focus:border-[#FF6B00] focus:outline-none focus:ring-1 focus:ring-[#FF6B00]";

export default function EnquireNowModal({ onClose }: EnquireNowModalProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const toggleModule = (id: string) => {
    setForm((current) => ({
      ...current,
      modules: current.modules.includes(id)
        ? current.modules.filter((item) => item !== id)
        : [...current.modules, id],
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setErrors({});

    try {
      const response = await fetch("/api/enquire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        errors?: Record<string, string>;
      };

      if (!response.ok) {
        setErrors(payload.errors ?? {});
        setSubmitError(payload.error ?? "Unable to send your enquiry.");
        return;
      }

      setSuccess(true);
    } catch {
      setSubmitError("Unable to send your enquiry. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={modalOverlayClass} style={{ zIndex: 80 }}>
      <div className="relative flex max-h-[min(92dvh,100%)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-[#FF6B00]/20 bg-white shadow-xl sm:max-h-[92vh] sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-[#FF6B00]/20 bg-[#121417] px-5 py-4">
          <div className="flex items-center gap-3">
            <SiteBoltMark className="h-9 w-9" />
            <div>
              <p className="text-[11px] font-extrabold tracking-[0.18em] text-white">SITEBOLT</p>
              <h2 className="text-lg font-bold text-white">
                {success ? "Enquiry received" : "Enquire Now"}
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
            <p className="mt-4 text-lg font-bold text-[#1F2429]">Thanks — we have your enquiry.</p>
            <p className="mt-2 max-w-sm text-sm text-zinc-600">
              A SiteBolt specialist will be in touch shortly to walk through the platform and
              your compliance requirements.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 rounded-lg bg-[#FF6B00] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#E65100]"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <div className="space-y-4">
              <Field
                id="enquire-name"
                label="Full Name"
                required
                error={errors.fullName}
                value={form.fullName}
                onChange={(value) => setForm((current) => ({ ...current, fullName: value }))}
              />
              <Field
                id="enquire-company"
                label="Company Name"
                required
                error={errors.companyName}
                value={form.companyName}
                onChange={(value) => setForm((current) => ({ ...current, companyName: value }))}
              />
              <Field
                id="enquire-email"
                label="Work Email"
                type="email"
                required
                error={errors.workEmail}
                value={form.workEmail}
                onChange={(value) => setForm((current) => ({ ...current, workEmail: value }))}
              />
              <Field
                id="enquire-phone"
                label="Phone Number"
                type="tel"
                value={form.phone}
                onChange={(value) => setForm((current) => ({ ...current, phone: value }))}
              />

              <div>
                <label htmlFor="enquire-state" className={labelClass}>
                  State <span className="text-[#FF6B00]">*</span>
                </label>
                <select
                  id="enquire-state"
                  required
                  value={form.state}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, state: event.target.value }))
                  }
                  className={cn(fieldClass, "mt-1", errors.state && "border-red-400")}
                >
                  <option value="">Select your state</option>
                  {SALES_ENQUIRY_STATE_OPTIONS.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
                {errors.state ? <p className="mt-1 text-xs text-red-600">{errors.state}</p> : null}
              </div>

              <div>
                <label htmlFor="enquire-team" className={labelClass}>
                  Fleet / Team Size
                </label>
                <select
                  id="enquire-team"
                  value={form.teamSize}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, teamSize: event.target.value }))
                  }
                  className={cn(fieldClass, "mt-1")}
                >
                  <option value="">Select size</option>
                  {SALES_ENQUIRY_TEAM_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>

              <fieldset>
                <legend className={labelClass}>Modules of interest</legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {SALES_ENQUIRY_MODULES.map((module) => (
                    <label
                      key={module.id}
                      className="flex items-center gap-2 rounded-lg border border-[#FF6B00]/20 bg-[#F8FAFC] px-3 py-2 text-sm text-[#1F2429]"
                    >
                      <input
                        type="checkbox"
                        checked={form.modules.includes(module.id)}
                        onChange={() => toggleModule(module.id)}
                        className="rounded border-zinc-300 text-[#FF6B00] focus:ring-[#FF6B00]"
                      />
                      {module.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>

            {submitError ? (
              <p className="mt-4 text-sm text-red-600">{submitError}</p>
            ) : null}

            <div className="mt-6 flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#FF6B00] py-3 text-sm font-semibold text-white hover:bg-[#E65100] disabled:bg-zinc-300"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Submit enquiry
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-[#1F2429] px-4 py-3 text-sm font-semibold text-white hover:bg-[#121417]"
              >
                Cancel
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
      <label htmlFor={id} className={labelClass}>
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
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
