"use client";

/** Worker self-service onboarding wizard — no Pay Rule input; API assigns pay rule from state on submit. */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, HardHat, Loader2 } from "lucide-react";
import StateRegionSelector from "@/components/workers/StateRegionSelector";
import VocListEditor from "@/components/workers/VocListEditor";
import { cardClass, inputClass, labelClass, sectionClass } from "@/lib/ui-classes";
import type { WorkerStateRegion } from "@/lib/worker-state-region";
import type { WorkerOnboardingRecord } from "@/lib/worker-onboarding";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import { workerDashboardUrl } from "@/lib/user-session";
import { scrubPayRuleConditionSaveError } from "@/lib/pay-rule-condition-errors";
import { vocFromRecord, type VocDraft } from "@/lib/voc-utils";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: 1, shortLabel: "Personal", title: "Personal & Emergency Contact" },
  { key: 2, shortLabel: "Financial", title: "Financial & Payroll Information" },
  { key: 3, shortLabel: "Licenses", title: "Tickets, Licenses & VOCs" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

interface OnboardingFormState {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  state: WorkerStateRegion | null;
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyContactPhone: string;
  bankName: string;
  bankBsb: string;
  bankAccountNumber: string;
  superFund: string;
  superMemberNumber: string;
  superUsi: string;
  tfn: string;
  redundancyFundName: string;
  redundancyMemberNumber: string;
  whiteCardNumber: string;
  whiteCardState: WorkerStateRegion | null;
  silicaCertNumber: string;
  silicaCertIssueDate: string;
  driversLicenceNumber: string;
  driversLicenceClass: string;
  driversLicenceExpiry: string;
  vocs: VocDraft[];
}

function parseApiError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const error = (payload as { error?: unknown }).error;
  const message =
    typeof error === "string" && error.trim() ? error.trim() : null;
  return scrubPayRuleConditionSaveError(message);
}

function Field({
  label,
  children,
  className,
  required = false,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  required?: boolean;
}) {
  return (
    <label className={cn("block space-y-1", className)}>
      <span className={labelClass}>
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}

function validateStep1(form: OnboardingFormState): string | null {
  if (!form.fullName.trim()) return "Full name is required.";
  if (!form.phone.trim()) return "Phone number is required.";
  if (!form.address.trim()) return "Address is required.";
  if (!form.state) return "State / Region is required.";
  if (!form.emergencyContactName.trim()) return "Emergency contact name is required.";
  if (!form.emergencyContactRelationship.trim()) {
    return "Emergency contact relationship is required.";
  }
  if (!form.emergencyContactPhone.trim()) return "Emergency contact phone is required.";
  return null;
}

function validateStep2(form: OnboardingFormState): string | null {
  if (!form.bankName.trim()) return "Bank name is required.";
  if (!form.bankBsb.trim()) return "Bank BSB is required.";
  if (!form.bankAccountNumber.trim()) return "Bank account number is required.";
  if (!form.superFund.trim()) return "Superannuation fund name is required.";
  if (!form.superMemberNumber.trim()) return "Super member number is required.";
  if (!form.tfn.trim()) return "Tax File Number is required.";
  return null;
}

function validateStep3(form: OnboardingFormState): string | null {
  for (const voc of form.vocs) {
    const hasContent =
      voc.voc_type.trim() ||
      voc.issuing_org.trim() ||
      voc.issue_date.trim() ||
      voc.expiry_date.trim() ||
      voc.document_url;
    if (hasContent && !voc.voc_type.trim()) {
      return "Each VOC row must include a licence or competency type.";
    }
  }
  return null;
}

function populateFormFromWorker(worker: WorkerOnboardingRecord): OnboardingFormState {
  const vocs =
    worker.vocs.length > 0
      ? worker.vocs.map((voc) =>
          vocFromRecord({
            id: voc.id ?? crypto.randomUUID(),
            title: voc.title,
            voc_type: voc.voc_type ?? voc.title,
            issuing_org: voc.issuing_org ?? null,
            issue_date: voc.issue_date ?? null,
            expiry_date: voc.expiry_date ?? null,
            document_url: voc.document_url ?? null,
            worker_id: worker.id,
          })
        )
      : [];

  return {
    fullName: getWorkerDisplayName(worker, ""),
    email: worker.email ?? "",
    phone: worker.phone ?? "",
    address: worker.address ?? "",
    state: (worker.state as WorkerStateRegion | null) ?? null,
    emergencyContactName: worker.emergency_contact_name ?? "",
    emergencyContactRelationship: worker.emergency_contact_relationship ?? "",
    emergencyContactPhone: worker.emergency_contact_phone ?? "",
    bankName: worker.bank_name ?? "",
    bankBsb: worker.bank_bsb ?? "",
    bankAccountNumber: worker.bank_account_number ?? "",
    superFund: worker.super_fund ?? "",
    superMemberNumber: worker.super_member_number ?? "",
    superUsi: worker.super_usi ?? "",
    tfn: worker.tfn ?? "",
    redundancyFundName: worker.redundancy_fund_name ?? "",
    redundancyMemberNumber: worker.redundancy_member_number ?? "",
    whiteCardNumber: worker.white_card_number ?? "",
    whiteCardState: (worker.state as WorkerStateRegion | null) ?? null,
    silicaCertNumber: worker.silica_cert_number ?? "",
    silicaCertIssueDate: worker.silica_cert_issue_date ?? "",
    driversLicenceNumber: worker.drivers_licence_number ?? "",
    driversLicenceClass: worker.drivers_licence_class ?? "",
    driversLicenceExpiry: worker.drivers_licence_expiry ?? "",
    vocs,
  };
}

function StepIndicator({ currentStep }: { currentStep: StepKey }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between gap-2">
        {STEPS.map((step, index) => {
          const isActive = step.key === currentStep;
          const isComplete = step.key < currentStep;
          return (
            <div key={step.key} className="flex flex-1 items-center gap-2">
              <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                    isActive
                      ? "bg-orange-500 text-white"
                      : isComplete
                        ? "bg-orange-100 text-orange-700"
                        : "bg-slate-100 text-slate-500"
                  )}
                >
                  {step.key}
                </div>
                <span
                  className={cn(
                    "hidden text-center text-xs font-medium sm:block",
                    isActive ? "text-orange-600" : "text-slate-500"
                  )}
                >
                  {step.shortLabel}
                </span>
              </div>
              {index < STEPS.length - 1 ? (
                <div
                  className={cn(
                    "mb-6 h-0.5 flex-1 rounded-full",
                    step.key < currentStep ? "bg-orange-300" : "bg-slate-200"
                  )}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-center text-sm font-medium text-slate-700">
        Step {currentStep}: {STEPS[currentStep - 1].title}
      </p>
    </div>
  );
}

export default function OnboardingForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [step, setStep] = useState<StepKey>(1);
  const [form, setForm] = useState<OnboardingFormState>(() => ({
    fullName: "",
    email: "",
    phone: "",
    address: "",
    state: null,
    emergencyContactName: "",
    emergencyContactRelationship: "",
    emergencyContactPhone: "",
    bankName: "",
    bankBsb: "",
    bankAccountNumber: "",
    superFund: "",
    superMemberNumber: "",
    superUsi: "",
    tfn: "",
    redundancyFundName: "",
    redundancyMemberNumber: "",
    whiteCardNumber: "",
    whiteCardState: null,
    silicaCertNumber: "",
    silicaCertIssueDate: "",
    driversLicenceNumber: "",
    driversLicenceClass: "",
    driversLicenceExpiry: "",
    vocs: [],
  }));

  const uploadPrefix = useMemo(
    () => (workerId ? `workers/${workerId}/onboarding` : undefined),
    [workerId]
  );

  const setField = <K extends keyof OnboardingFormState>(
    key: K,
    value: OnboardingFormState[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    if (step === 3 && form.state && !form.whiteCardState) {
      setForm((prev) => ({ ...prev, whiteCardState: prev.state }));
    }
  }, [step, form.state, form.whiteCardState]);

  useEffect(() => {
    let cancelled = false;

    async function loadWorker() {
      try {
        await fetch("/api/workers/ensure-profile", { method: "POST" });

        const response = await fetch("/api/workers/onboarding");
        let payload: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          await fetch("/api/workers/ensure-profile", { method: "POST" });
          const retryResponse = await fetch("/api/workers/onboarding");
          payload = await retryResponse.json().catch(() => null);

          if (!retryResponse.ok) {
            if (!cancelled) {
              setError(parseApiError(payload) ?? "Unable to load your worker profile.");
              setLoading(false);
            }
            return;
          }
        }

        const worker = (payload as { worker?: WorkerOnboardingRecord }).worker;
        if (!worker?.id) {
          if (!cancelled) {
            setError("Unable to prepare your worker profile. Please refresh and try again.");
            setLoading(false);
          }
          return;
        }

        if (worker.onboarding_completed) {
          router.replace(`${workerDashboardUrl(worker.id)}&welcome=1`);
          return;
        }

        if (!cancelled) {
          setWorkerId(worker.id);
          setForm(populateFormFromWorker(worker));
          setLoading(false);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Unable to load onboarding.");
          setLoading(false);
        }
      }
    }

    void loadWorker();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const validateCurrentStep = (): string | null => {
    if (step === 1) return validateStep1(form);
    if (step === 2) return validateStep2(form);
    return validateStep3(form);
  };

  const handleNext = () => {
    setError(null);
    const validationError = validateCurrentStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    if (step < 3) {
      setStep((prev) => (prev + 1) as StepKey);
    }
  };

  const handleBack = () => {
    setError(null);
    if (step > 1) {
      setStep((prev) => (prev - 1) as StepKey);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    const step1Error = validateStep1(form);
    const step2Error = validateStep2(form);
    const step3Error = validateStep3(form);
    const validationError = step1Error ?? step2Error ?? step3Error;
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/workers/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName,
          email: form.email,
          phone: form.phone,
          address: form.address,
          state: form.state ?? "",
          emergencyContactName: form.emergencyContactName,
          emergencyContactRelationship: form.emergencyContactRelationship,
          emergencyContactPhone: form.emergencyContactPhone,
          bankName: form.bankName,
          bankBsb: form.bankBsb,
          bankAccountNumber: form.bankAccountNumber,
          superFund: form.superFund,
          superMemberNumber: form.superMemberNumber,
          superUsi: form.superUsi,
          tfn: form.tfn,
          redundancyFundName: form.redundancyFundName,
          redundancyMemberNumber: form.redundancyMemberNumber,
          whiteCardNumber: form.whiteCardNumber,
          whiteCardState: form.whiteCardState ?? "",
          silicaCertNumber: form.silicaCertNumber,
          silicaCertIssueDate: form.silicaCertIssueDate,
          driversLicenceNumber: form.driversLicenceNumber,
          driversLicenceClass: form.driversLicenceClass,
          driversLicenceExpiry: form.driversLicenceExpiry,
          vocs: form.vocs
            .filter((voc) => voc.voc_type.trim())
            .map((voc) => ({
              voc_type: voc.voc_type,
              title: voc.voc_type,
              issuing_org: voc.issuing_org,
              issue_date: voc.issue_date,
              expiry_date: voc.expiry_date,
              document_url: voc.document_url,
            })),
        }),
      });

      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setError(parseApiError(payload) ?? "Failed to save your details.");
        return;
      }

      const savedWorkerId =
        payload &&
        typeof payload === "object" &&
        "workerId" in payload &&
        typeof payload.workerId === "string"
          ? payload.workerId
          : workerId;

      router.replace(
        savedWorkerId
          ? `${workerDashboardUrl(savedWorkerId)}&welcome=1`
          : "/worker-dashboard?welcome=1"
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to save your details.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className={cardClass + " w-full max-w-3xl p-8"}>
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500">
            <HardHat className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">
              SiteBolt
            </p>
            <h1 className="text-xl font-bold text-slate-900">Complete Your Account Setup</h1>
          </div>
        </div>

        <p className="mb-2 text-sm text-slate-600">
          Welcome to SiteBolt. Complete each step so your team can reach you and keep your
          compliance records up to date.
        </p>

        <StepIndicator currentStep={step} />

        <div className="space-y-4">
          {step === 1 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full Name" className="sm:col-span-2" required>
                <input
                  type="text"
                  className={inputClass}
                  value={form.fullName}
                  onChange={(event) => setField("fullName", event.target.value)}
                  autoComplete="name"
                />
              </Field>
              <Field label="Email" className="sm:col-span-2">
                <input
                  type="email"
                  className={cn(inputClass, "bg-slate-50 text-slate-600")}
                  value={form.email}
                  readOnly
                  aria-readonly="true"
                />
              </Field>
              <Field label="Phone Number" required>
                <input
                  type="tel"
                  className={inputClass}
                  value={form.phone}
                  onChange={(event) => setField("phone", event.target.value)}
                  autoComplete="tel"
                />
              </Field>
              <Field label="Address" required>
                <input
                  type="text"
                  className={inputClass}
                  value={form.address}
                  onChange={(event) => setField("address", event.target.value)}
                  autoComplete="street-address"
                />
              </Field>
              <div className="sm:col-span-2">
                <StateRegionSelector
                  id="onboarding-work-state"
                  value={form.state}
                  onChange={(value) => setField("state", value)}
                  disabled={submitting}
                />
              </div>
              <div className={cn(sectionClass, "sm:col-span-2")}>
                <h4 className="text-sm font-semibold text-orange-600">Emergency Contact</h4>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label="Contact Name" required>
                    <input
                      type="text"
                      className={inputClass}
                      value={form.emergencyContactName}
                      onChange={(event) =>
                        setField("emergencyContactName", event.target.value)
                      }
                      autoComplete="name"
                    />
                  </Field>
                  <Field label="Relationship" required>
                    <input
                      type="text"
                      className={inputClass}
                      placeholder="e.g. Spouse, Parent"
                      value={form.emergencyContactRelationship}
                      onChange={(event) =>
                        setField("emergencyContactRelationship", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Phone Number" className="sm:col-span-2" required>
                    <input
                      type="tel"
                      className={inputClass}
                      value={form.emergencyContactPhone}
                      onChange={(event) =>
                        setField("emergencyContactPhone", event.target.value)
                      }
                      autoComplete="tel"
                    />
                  </Field>
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className={cn(sectionClass, "sm:col-span-2")}>
                <h4 className="text-sm font-semibold text-orange-600">Bank Details</h4>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label="Bank Name" required>
                    <input
                      type="text"
                      className={inputClass}
                      value={form.bankName}
                      onChange={(event) => setField("bankName", event.target.value)}
                    />
                  </Field>
                  <Field label="BSB" required>
                    <input
                      type="text"
                      className={inputClass}
                      placeholder="000-000"
                      value={form.bankBsb}
                      onChange={(event) => setField("bankBsb", event.target.value)}
                    />
                  </Field>
                  <Field label="Account Number" className="sm:col-span-2" required>
                    <input
                      type="text"
                      className={inputClass}
                      value={form.bankAccountNumber}
                      onChange={(event) =>
                        setField("bankAccountNumber", event.target.value)
                      }
                    />
                  </Field>
                </div>
              </div>

              <div className={cn(sectionClass, "sm:col-span-2")}>
                <h4 className="text-sm font-semibold text-orange-600">Superannuation</h4>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label="Fund Name" required>
                    <input
                      type="text"
                      className={inputClass}
                      value={form.superFund}
                      onChange={(event) => setField("superFund", event.target.value)}
                    />
                  </Field>
                  <Field label="Member Number" required>
                    <input
                      type="text"
                      className={inputClass}
                      value={form.superMemberNumber}
                      onChange={(event) =>
                        setField("superMemberNumber", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="USI" className="sm:col-span-2">
                    <input
                      type="text"
                      className={inputClass}
                      value={form.superUsi}
                      onChange={(event) => setField("superUsi", event.target.value)}
                    />
                  </Field>
                </div>
              </div>

              <div className={cn(sectionClass, "sm:col-span-2")}>
                <h4 className="text-sm font-semibold text-orange-600">Tax File Number</h4>
                <div className="mt-3">
                  <Field label="TFN" required>
                    <input
                      type="text"
                      className={inputClass}
                      value={form.tfn}
                      onChange={(event) => setField("tfn", event.target.value)}
                      autoComplete="off"
                    />
                  </Field>
                </div>
              </div>

              <div className={cn(sectionClass, "sm:col-span-2")}>
                <h4 className="text-sm font-semibold text-orange-600">Redundancy Fund</h4>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label="Fund Name (e.g. Incolink, BERT, BIRT)">
                    <input
                      type="text"
                      className={inputClass}
                      value={form.redundancyFundName}
                      onChange={(event) =>
                        setField("redundancyFundName", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Member / ID Number">
                    <input
                      type="text"
                      className={inputClass}
                      value={form.redundancyMemberNumber}
                      onChange={(event) =>
                        setField("redundancyMemberNumber", event.target.value)
                      }
                    />
                  </Field>
                </div>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <div className={sectionClass}>
                <h4 className="text-sm font-semibold text-orange-600">White Card</h4>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label="Card Number">
                    <input
                      type="text"
                      className={inputClass}
                      value={form.whiteCardNumber}
                      onChange={(event) => setField("whiteCardNumber", event.target.value)}
                    />
                  </Field>
                  <StateRegionSelector
                    id="onboarding-white-card-state"
                    value={form.whiteCardState}
                    onChange={(value) => setField("whiteCardState", value)}
                    required={false}
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className={sectionClass}>
                <h4 className="text-sm font-semibold text-orange-600">
                  Silica Awareness / Course
                </h4>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label="Certificate / Course Number">
                    <input
                      type="text"
                      className={inputClass}
                      value={form.silicaCertNumber}
                      onChange={(event) =>
                        setField("silicaCertNumber", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Issue / Completion Date">
                    <input
                      type="date"
                      className={inputClass}
                      value={form.silicaCertIssueDate}
                      onChange={(event) =>
                        setField("silicaCertIssueDate", event.target.value)
                      }
                    />
                  </Field>
                </div>
              </div>

              <div className={sectionClass}>
                <h4 className="text-sm font-semibold text-orange-600">
                  High Risk Work Licence
                </h4>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label="Licence Number">
                    <input
                      type="text"
                      className={inputClass}
                      value={form.driversLicenceNumber}
                      onChange={(event) =>
                        setField("driversLicenceNumber", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Class">
                    <input
                      type="text"
                      className={inputClass}
                      placeholder="e.g. C, MR, HR"
                      value={form.driversLicenceClass}
                      onChange={(event) =>
                        setField("driversLicenceClass", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Expiry Date">
                    <input
                      type="date"
                      className={inputClass}
                      value={form.driversLicenceExpiry}
                      onChange={(event) =>
                        setField("driversLicenceExpiry", event.target.value)
                      }
                    />
                  </Field>
                </div>
              </div>

              <div className={sectionClass}>
                <h4 className="text-sm font-semibold text-orange-600">
                  VOCs (Verification of Competency)
                </h4>
                <div className="mt-3">
                  <VocListEditor
                    vocs={form.vocs}
                    onChange={(vocs) => setField("vocs", vocs)}
                    minItems={0}
                    uploadPathPrefix={
                      uploadPrefix ? `${uploadPrefix}/vocs` : undefined
                    }
                  />
                </div>
              </div>
            </div>
          ) : null}

          {typeof error === "string" && error ? (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>
          ) : null}

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-between">
            {step > 1 ? (
              <button
                type="button"
                onClick={handleBack}
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
            ) : (
              <div className="hidden sm:block" />
            )}

            {step < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 disabled:opacity-60 sm:ml-auto"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 disabled:opacity-60 sm:ml-auto"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  "Submit"
                )}
              </button>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          Need help?{" "}
          <Link href="/login" className="font-medium text-orange-600 hover:text-orange-700">
            Contact your administrator
          </Link>
        </p>
      </div>
    </div>
  );
}
