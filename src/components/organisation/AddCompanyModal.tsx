"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  COMPANY_MODULE_OPTIONS,
  COMPANY_STATE_OPTIONS,
  type WorkspaceCompany,
} from "@/lib/organisation-workspace";
import { modalOverlayClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface AddCompanyModalProps {
  onClose: () => void;
  onCreated: (company: WorkspaceCompany) => void;
}

const fieldClass =
  "w-full rounded-lg border border-white/10 bg-[#121417] px-3 py-2 text-sm text-white focus:border-[#FF6B00] focus:outline-none focus:ring-1 focus:ring-[#FF6B00]";

export default function AddCompanyModal({ onClose, onCreated }: AddCompanyModalProps) {
  const [companyName, setCompanyName] = useState("");
  const [state, setState] = useState("");
  const [modules, setModules] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleModule = (id: string) => {
    setModules((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/super-admin/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, state, modules }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        company?: WorkspaceCompany;
      };
      if (!response.ok || !payload.company) {
        setError(payload.error ?? "Unable to create company.");
        return;
      }
      onCreated(payload.company);
    } catch {
      setError("Unable to create company.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={modalOverlayClass} style={{ zIndex: 80 }}>
      <div className="relative w-full max-w-lg overflow-hidden rounded-t-2xl border border-[#FF6B00]/20 bg-[#1F2429] shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-[#FF6B00]/20 px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#FF6B00]">
              Super-admin
            </p>
            <h2 className="text-lg font-bold text-white">Add Another Company</h2>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-white" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          <div>
            <label htmlFor="new-company-name" className="text-xs text-zinc-400">
              Company Name <span className="text-[#FF6B00]">*</span>
            </label>
            <input
              id="new-company-name"
              required
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              className={cn(fieldClass, "mt-1")}
            />
          </div>

          <div>
            <label htmlFor="new-company-state" className="text-xs text-zinc-400">
              Primary Operating State <span className="text-[#FF6B00]">*</span>
            </label>
            <select
              id="new-company-state"
              required
              value={state}
              onChange={(event) => setState(event.target.value)}
              className={cn(fieldClass, "mt-1")}
            >
              <option value="">Select your state</option>
              {COMPANY_STATE_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <fieldset>
            <legend className="text-xs text-zinc-400">Enabled Modules</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {COMPANY_MODULE_OPTIONS.map((module) => (
                <label
                  key={module.id}
                  className="flex items-center gap-2 rounded-lg border border-[#FF6B00]/20 bg-[#121417] px-3 py-2 text-sm text-white"
                >
                  <input
                    type="checkbox"
                    checked={modules.includes(module.id)}
                    onChange={() => toggleModule(module.id)}
                    className="rounded border-zinc-500 text-[#FF6B00] focus:ring-[#FF6B00]"
                  />
                  {module.label}
                </label>
              ))}
            </div>
          </fieldset>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#FF6B00] py-3 text-sm font-semibold text-white hover:bg-[#E65100] disabled:bg-zinc-600"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create company
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/15 px-4 py-3 text-sm font-semibold text-white hover:border-[#FF6B00]"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
