"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Loader2, X } from "lucide-react";
import { type WorkspaceCompany } from "@/lib/organisation-workspace";
import {
  CORE_MODULE_CATALOG,
  OPERATING_STATE_IDS,
  OPERATING_STATE_OPTIONS,
  TOOL_MODULE_CATALOG,
  WORKER_FIELD_CATALOG,
  parseOrganisationFeatureFlags,
  toggleFeatureFlag,
  withOperatingStates,
  type OperatingStateId,
  type OrganisationFeatureFlags,
} from "@/lib/organisation-feature-flags";
import { A_PLUS_ORGANISATION_ID } from "@/lib/active-organisation";
import { modalOverlayClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface CompanyFeatureConfigModalProps {
  mode: "create" | "edit";
  company?: WorkspaceCompany | null;
  onClose: () => void;
  onSaved: (company: WorkspaceCompany) => void;
}

const fieldClass =
  "w-full rounded-lg border border-white/10 bg-[#121417] px-3 py-2 text-sm text-white focus:border-[#FF6B00] focus:outline-none focus:ring-1 focus:ring-[#FF6B00]";

function AccordionSection({
  title,
  subtitle,
  defaultOpen = true,
  children,
}: {
  title: string;
  subtitle: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-xl border border-white/10 bg-[#121417]">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="text-xs text-zinc-500">{subtitle}</p>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-[#FF6B00]" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
        )}
      </button>
      {open ? <div className="space-y-2 border-t border-white/10 px-4 py-3">{children}</div> : null}
    </section>
  );
}

function FlagRow({
  checked,
  disabled,
  label,
  description,
  onToggle,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  description?: string;
  onToggle: () => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition",
        checked
          ? "border-[#FF6B00]/35 bg-[#FF6B00]/10"
          : "border-white/10 bg-[#1F2429]",
        disabled && "cursor-not-allowed opacity-70"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
          checked ? "border-[#FF6B00] bg-[#FF6B00]" : "border-zinc-500 bg-transparent"
        )}
      >
        {checked ? <Check className="h-3 w-3 text-white" /> : null}
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
      />
      <span>
        <span className="block text-sm font-medium text-white">{label}</span>
        {description ? <span className="block text-xs text-zinc-500">{description}</span> : null}
      </span>
    </label>
  );
}

function OperatingStatesPicker({
  selected,
  disabled,
  onToggle,
  onSelectAll,
  onClearAll,
}: {
  selected: OperatingStateId[];
  disabled?: boolean;
  onToggle: (id: OperatingStateId) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}) {
  return (
    <fieldset>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <legend className="text-xs text-zinc-400">
          Operating Jurisdictions / States <span className="text-[#FF6B00]">*</span>
        </legend>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={onSelectAll}
            className="text-xs font-semibold text-[#FF6B00] hover:text-[#FF8533] disabled:opacity-50"
          >
            Select All
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onClearAll}
            className="text-xs font-semibold text-zinc-400 hover:text-white disabled:opacity-50"
          >
            Clear All
          </button>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {OPERATING_STATE_OPTIONS.map((item) => (
          <FlagRow
            key={item.id}
            checked={selected.includes(item.id)}
            disabled={disabled}
            label={item.label}
            onToggle={() => onToggle(item.id)}
          />
        ))}
      </div>
    </fieldset>
  );
}

export default function CompanyFeatureConfigModal({
  mode,
  company,
  onClose,
  onSaved,
}: CompanyFeatureConfigModalProps) {
  const locked = company?.id === A_PLUS_ORGANISATION_ID;
  const [step, setStep] = useState<1 | 2>(mode === "edit" ? 2 : 1);
  const [companyName, setCompanyName] = useState(company?.company_name ?? "");
  const [flags, setFlags] = useState<OrganisationFeatureFlags>(() =>
    parseOrganisationFeatureFlags(company?.feature_flags, company?.id, company?.state)
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = mode === "create" ? "Add New Company" : "Edit Configuration";
  const submitLabel = mode === "create" ? "Create Company" : "Save Changes";
  const selectedStates = flags.operating_states;

  const canContinue = useMemo(
    () => companyName.trim().length > 0 && selectedStates.length > 0,
    [companyName, selectedStates.length]
  );

  const toggleState = (id: OperatingStateId) => {
    if (locked) return;
    const next = selectedStates.includes(id)
      ? selectedStates.filter((item) => item !== id)
      : [...selectedStates, id];
    setFlags((current) => withOperatingStates(current, next));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/super-admin/companies", {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "create"
            ? {
                companyName,
                operatingStates: flags.operating_states,
                featureFlags: flags,
              }
            : {
                id: company?.id,
                operatingStates: flags.operating_states,
                featureFlags: flags,
              }
        ),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        company?: WorkspaceCompany;
      };
      if (!response.ok || !payload.company) {
        setError(payload.error ?? "Unable to save company configuration.");
        return;
      }
      onSaved({
        ...payload.company,
        feature_flags: parseOrganisationFeatureFlags(
          payload.company.feature_flags,
          payload.company.id
        ),
      });
    } catch {
      setError("Unable to save company configuration.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={modalOverlayClass} style={{ zIndex: 80 }}>
      <div className="relative flex max-h-[min(92dvh,100%)] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-[#FF6B00]/25 bg-[#1F2429] shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#FF6B00]">
              Super-admin
            </p>
            <h2 className="text-lg font-bold text-white">{title}</h2>
            {mode === "edit" && company ? (
              <p className="mt-0.5 text-xs text-zinc-400">{company.company_name}</p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-white" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {locked ? (
            <p className="rounded-lg border border-[#FF6B00]/30 bg-[#FF6B00]/10 px-3 py-2 text-xs text-zinc-200">
              A Plus Plumbing retains every module and worker field. Configuration for this live
              tenant cannot be reduced.
            </p>
          ) : null}

          {mode === "create" && step === 1 ? (
            <>
              <div>
                <label htmlFor="wizard-company-name" className="text-xs text-zinc-400">
                  Company Name <span className="text-[#FF6B00]">*</span>
                </label>
                <input
                  id="wizard-company-name"
                  required
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  className={cn(fieldClass, "mt-1")}
                />
              </div>
              <OperatingStatesPicker
                selected={selectedStates}
                disabled={locked}
                onToggle={toggleState}
                onSelectAll={() =>
                  setFlags((current) => withOperatingStates(current, [...OPERATING_STATE_IDS]))
                }
                onClearAll={() => setFlags((current) => withOperatingStates(current, []))}
              />
            </>
          ) : (
            <>
              {mode === "edit" ? (
                <OperatingStatesPicker
                  selected={selectedStates}
                  disabled={locked}
                  onToggle={toggleState}
                  onSelectAll={() =>
                    setFlags((current) => withOperatingStates(current, [...OPERATING_STATE_IDS]))
                  }
                  onClearAll={() => setFlags((current) => withOperatingStates(current, []))}
                />
              ) : null}
              <AccordionSection
                title="Section 1: Core Modules & Navigation"
                subtitle="Sidebar areas available in this workspace"
              >
                {CORE_MODULE_CATALOG.map((item) => (
                  <FlagRow
                    key={item.id}
                    checked={flags.modules[item.id]}
                    disabled={locked}
                    label={item.label}
                    description={item.description}
                    onToggle={() =>
                      setFlags((current) =>
                        toggleFeatureFlag(current, "modules", item.id, !current.modules[item.id])
                      )
                    }
                  />
                ))}
              </AccordionSection>

              <AccordionSection
                title="Section 2: Operational Sub-Modules & Tools"
                subtitle="Plant, safety, quality, calendars, and insurance tools"
              >
                {TOOL_MODULE_CATALOG.map((item) => (
                  <FlagRow
                    key={item.id}
                    checked={flags.modules[item.id]}
                    disabled={locked}
                    label={item.label}
                    description={item.description}
                    onToggle={() =>
                      setFlags((current) =>
                        toggleFeatureFlag(current, "modules", item.id, !current.modules[item.id])
                      )
                    }
                  />
                ))}
              </AccordionSection>

              <AccordionSection
                title="Section 3: Worker Profile Permissions & Fields"
                subtitle="Fields shown on worker profiles for this company"
                defaultOpen={false}
              >
                {WORKER_FIELD_CATALOG.map((item) => (
                  <FlagRow
                    key={item.id}
                    checked={flags.workerFields[item.id]}
                    disabled={locked}
                    label={item.label}
                    onToggle={() =>
                      setFlags((current) =>
                        toggleFeatureFlag(
                          current,
                          "workerFields",
                          item.id,
                          !current.workerFields[item.id]
                        )
                      )
                    }
                  />
                ))}
              </AccordionSection>
            </>
          )}

          {error ? <p className="text-sm text-red-400">{error}</p> : null}
        </div>

        <div className="flex flex-wrap gap-3 border-t border-white/10 px-5 py-4">
          {mode === "create" && step === 2 ? (
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-lg border border-white/15 px-4 py-3 text-sm font-semibold text-white hover:border-[#FF6B00]"
            >
              Back
            </button>
          ) : null}
          {mode === "create" && step === 1 ? (
            <button
              type="button"
              disabled={!canContinue}
              onClick={() => setStep(2)}
              className="flex flex-1 items-center justify-center rounded-lg bg-[#FF6B00] py-3 text-sm font-semibold text-white hover:bg-[#E65100] disabled:bg-zinc-600"
            >
              Continue to features
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting || (mode === "create" && !canContinue)}
              onClick={() => void handleSubmit()}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#FF6B00] py-3 text-sm font-semibold text-white hover:bg-[#E65100] disabled:bg-zinc-600"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {submitLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/15 px-4 py-3 text-sm font-semibold text-white hover:border-[#FF6B00]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
