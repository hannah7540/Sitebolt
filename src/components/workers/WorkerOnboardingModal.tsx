"use client";

/** Quick Invite and Full Admin Onboarding — no Pay Rule field; pay rules are assigned on save from state. */

import { useState, useRef } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  UserPlus,
  ClipboardList,
} from "lucide-react";
import { addWorker, insertWorkerVocs, type WorkerOnboardingInput } from "@/lib/supabase";
import { DEFAULT_WORKER_SECURITY_ROLE } from "@/lib/security-roles";
import { uploadWorkerDocumentSafe } from "@/lib/worker-doc-upload";
import { resolveProjectId, isProjectUuid } from "@/lib/project-resolver";
import { nullIfBlankWorkerDate, nullIfBlankWorkerText } from "@/lib/worker-utils";
import { requestWorkerAuthInvite } from "@/lib/worker-invite-client";
import { scrubPayRuleConditionSaveError } from "@/lib/pay-rule-condition-errors";
import ProjectSelect from "@/components/ui/ProjectSelect";
import { cn } from "@/lib/utils";
import {
  inputClass,
  sectionClass,
  modalOverlayClass,
  modalShellClass,
  modalBodyClass,
  modalCloseIconButtonClass,
  labelClass,
} from "@/lib/ui-classes";
import ModalActionFooter from "@/components/ui/ModalActionFooter";
import DocumentCapture from "@/components/ui/DocumentCapture";
import VocListEditor from "./VocListEditor";
import StateRegionSelector from "./StateRegionSelector";
import WorkerCompanyVehicleFields from "./WorkerCompanyVehicleFields";
import { createEmptyVoc, type VocDraft } from "@/lib/voc-utils";
import type { WorkerStateRegion } from "@/lib/worker-state-region";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import {
  ONBOARDING_REQUIRED_TOAST,
  firstMissingOnboardingField,
  missingOnboardingFields,
  scrollToOnboardingField,
} from "@/lib/onboarding-required-fields";

type OnboardingMode = "quick" | "full";

const FULL_STEPS = [
  "Personal & Emergency",
  "Tickets & Compliance",
  "Financial & Redundancy",
  "Project Assignment",
];

interface DocFiles {
  white_card: File | null;
  silica_cert: File | null;
  drivers_licence: File | null;
}

interface DocUrls {
  white_card: string | null;
  silica_cert: string | null;
  drivers_licence: string | null;
}

const emptyForm = (): Partial<WorkerOnboardingInput> => ({
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  address_line_1: "",
  address_line_2: "",
  suburb: "",
  postcode: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  emergency_contact_relationship: "",
  dob: "",
  white_card_number: "",
  white_card_issue_date: "",
  drivers_licence_number: "",
  drivers_licence_class: "",
  drivers_licence_expiry: "",
  silica_cert_number: "",
  silica_cert_issue_date: "",
  tfn: "",
  bank_bsb: "",
  bank_account_number: "",
  bank_name: "",
  super_fund: "",
  super_member_number: "",
  redundancy_fund_name: "",
  redundancy_member_number: "",
  assigned_project_id: null,
  state: null,
  is_apprentice: false,
  has_company_vehicle: false,
  assigned_vehicle_asset_id: null,
  status: "pending_induction",
});

interface WorkerOnboardingModalProps {
  onClose: () => void;
  onSaved: () => void;
  hideFinancialFields?: boolean;
}

function Field({
  label,
  children,
  required = false,
  error,
  fieldId,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  error?: string;
  fieldId?: string;
}) {
  return (
    <label className="block space-y-1" data-onboarding-field={fieldId}>
      <span className={labelClass}>
        {label.replace(/ \*$/, "")}
        {required ? <span className="text-orange-500"> *</span> : null}
      </span>
      {children}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </label>
  );
}

function DocSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={sectionClass}>
      <h4 className="text-sm font-semibold text-orange-600">{title}</h4>
      {children}
    </div>
  );
}

export default function WorkerOnboardingModal({
  onClose,
  onSaved,
  hideFinancialFields = false,
}: WorkerOnboardingModalProps) {
  const { toast, showError, showSuccess, dismissToast } = useFormToast();
  const fullSteps = hideFinancialFields
    ? FULL_STEPS.filter((s) => s !== "Financial & Redundancy")
    : FULL_STEPS;
  const projectStep = hideFinancialFields ? 2 : 3;
  const [mode, setMode] = useState<OnboardingMode>("quick");
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [docs, setDocs] = useState<DocFiles>({
    white_card: null,
    silica_cert: null,
    drivers_licence: null,
  });
  const [docUrls, setDocUrls] = useState<DocUrls>({
    white_card: null,
    silica_cert: null,
    drivers_licence: null,
  });
  const uploadPrefixRef = useRef(
    `onboarding/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  const uploadPrefix = uploadPrefixRef.current;
  const [vocs, setVocs] = useState<VocDraft[]>([createEmptyVoc()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const set = (key: keyof WorkerOnboardingInput, value: string | null) => {
    setForm((prev) => ({
      ...prev,
      [key]:
        typeof value === "string"
          ? value.trim() || null
          : value,
    }));
  };

  const setDoc = (key: keyof DocFiles, file: File | null) => {
    setDocs((prev) => ({ ...prev, [key]: file }));
  };

  const switchMode = (next: OnboardingMode) => {
    setMode(next);
    setStep(0);
    setError(null);
    setFieldErrors({});
  };

  const personalChecks = () => [
    { field: "first_name", value: form.first_name },
    { field: "last_name", value: form.last_name },
    { field: "email", value: form.email },
    { field: "phone", value: form.phone },
    { field: "address_line_1", value: form.address_line_1 },
    { field: "suburb", value: form.suburb },
    { field: "postcode", value: form.postcode },
    { field: "state", value: form.state },
    { field: "dob", value: form.dob },
    { field: "emergency_contact_name", value: form.emergency_contact_name },
    { field: "emergency_contact_relationship", value: form.emergency_contact_relationship },
    { field: "emergency_contact_phone", value: form.emergency_contact_phone },
  ];

  const ticketChecks = () => [
    { field: "white_card_number", value: form.white_card_number },
    { field: "white_card_issue_date", value: form.white_card_issue_date },
    { field: "white_card_attachment", value: docs.white_card ?? docUrls.white_card },
    { field: "silica_cert_number", value: form.silica_cert_number },
    { field: "silica_cert_issue_date", value: form.silica_cert_issue_date },
    { field: "silica_cert_attachment", value: docs.silica_cert ?? docUrls.silica_cert },
  ];

  const financialChecks = () => [
    { field: "tfn", value: form.tfn },
    { field: "bank_name", value: form.bank_name },
    { field: "bank_bsb", value: form.bank_bsb },
    { field: "bank_account_number", value: form.bank_account_number },
    { field: "super_fund", value: form.super_fund },
    { field: "super_member_number", value: form.super_member_number },
  ];

  const quickChecks = () => [
    { field: "first_name", value: form.first_name },
    { field: "last_name", value: form.last_name },
    { field: "email", value: form.email },
    { field: "phone", value: form.phone },
    { field: "state", value: form.state },
  ];

  const checksForStep = (targetStep: number) => {
    if (mode === "quick") return quickChecks();
    if (targetStep === 0) return personalChecks();
    if (targetStep === 1) return ticketChecks();
    if (targetStep === 2 && !hideFinancialFields) return financialChecks();
    return [];
  };

  const applyFieldValidation = (
    targetStep: number
  ): { field: string; message: string } | null => {
    const checks = [...checksForStep(targetStep)];
    if (
      (mode === "quick" || targetStep === 0) &&
      form.has_company_vehicle &&
      !form.assigned_vehicle_asset_id
    ) {
      checks.push({ field: "assigned_vehicle_asset_id", value: "" });
    }

    const errors = missingOnboardingFields(checks);
    setFieldErrors(errors);
    const first = firstMissingOnboardingField(checks);
    if (first) {
      setError(ONBOARDING_REQUIRED_TOAST);
      showError(ONBOARDING_REQUIRED_TOAST);
      scrollToOnboardingField(first.field);
      return first;
    }
    setError(null);
    return null;
  };

  const validateAllFullSteps = (): number | null => {
    const stepsToCheck = hideFinancialFields ? [0, 1] : [0, 1, 2];
    for (const targetStep of stepsToCheck) {
      const first = firstMissingOnboardingField(checksForStep(targetStep));
      if (first) {
        setStep(targetStep);
        window.setTimeout(() => applyFieldValidation(targetStep), 0);
        return targetStep;
      }
    }
    if (form.has_company_vehicle && !form.assigned_vehicle_asset_id) {
      setStep(0);
      window.setTimeout(() => applyFieldValidation(0), 0);
      return 0;
    }
    return null;
  };

  const handleNextStep = () => {
    if (applyFieldValidation(step)) return;
    setStep((s) => s + 1);
  };

  const sendWorkerInviteEmail = async (email: string, workerId?: string) => {
    await requestWorkerAuthInvite(email, workerId);
  };

  const handleSubmit = async () => {
    if (mode === "quick") {
      if (applyFieldValidation(0)) return;
    } else if (validateAllFullSteps() !== null) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      let resolvedProjectId: string | null = null;

      if (form.assigned_project_id?.trim()) {
        const { id, error: projectError } = await resolveProjectId(
          form.assigned_project_id
        );

        if (projectError || !id || !isProjectUuid(id)) {
          setError(
            projectError ??
              "Invalid project selected. Choose a project from the list or leave unassigned."
          );
          setSubmitting(false);
          return;
        }
        resolvedProjectId = id;
      }
      let white_card_photo_url = docUrls.white_card;
      let silica_cert_photo_url = docUrls.silica_cert;
      let drivers_licence_photo_url = docUrls.drivers_licence;

      if (mode === "full") {
        [white_card_photo_url, silica_cert_photo_url, drivers_licence_photo_url] =
          await Promise.all([
            white_card_photo_url ??
              uploadWorkerDocumentSafe(docs.white_card, `${uploadPrefix}/white-card`),
            silica_cert_photo_url ??
              uploadWorkerDocumentSafe(docs.silica_cert, `${uploadPrefix}/silica-cert`),
            drivers_licence_photo_url ??
              uploadWorkerDocumentSafe(
                docs.drivers_licence,
                `${uploadPrefix}/drivers-licence`
              ),
          ]);
      }

      const payload: Partial<Omit<WorkerOnboardingInput, "first_name" | "last_name" | "email">> & {
        first_name: string;
        last_name: string;
        email: string;
      } = {
        first_name: (form.first_name ?? "").trim(),
        last_name: (form.last_name ?? "").trim(),
        email: (form.email ?? "").trim(),
        phone: nullIfBlankWorkerText(form.phone),
        assigned_project_id: resolvedProjectId,
        state: form.state,
        is_apprentice: form.is_apprentice ?? false,
        has_company_vehicle: form.has_company_vehicle ?? false,
        assigned_vehicle_asset_id: form.has_company_vehicle
          ? form.assigned_vehicle_asset_id ?? null
          : null,
        status: "pending_induction",
        security_role: DEFAULT_WORKER_SECURITY_ROLE,
        onboarding_completed: false,
        invite_status: "pending",
      };

      if (mode === "full") {
        Object.assign(payload, {
          ...form,
          first_name: (form.first_name ?? "").trim(),
          last_name: (form.last_name ?? "").trim(),
          email: (form.email ?? "").trim(),
          phone: nullIfBlankWorkerText(form.phone),
          address_line_1: nullIfBlankWorkerText(form.address_line_1),
          address_line_2: nullIfBlankWorkerText(form.address_line_2),
          suburb: nullIfBlankWorkerText(form.suburb),
          postcode: nullIfBlankWorkerText(form.postcode),
          assigned_project_id: resolvedProjectId,
          dob: nullIfBlankWorkerDate(form.dob),
          white_card_issue_date: nullIfBlankWorkerDate(form.white_card_issue_date),
          drivers_licence_expiry: nullIfBlankWorkerDate(form.drivers_licence_expiry),
          silica_cert_issue_date: nullIfBlankWorkerDate(form.silica_cert_issue_date),
          white_card_photo_url,
          silica_cert_photo_url,
          drivers_licence_photo_url,
        });
      }

      payload.onboarding_completed = mode === "full";
      payload.invite_status = "pending";

      const vocExpiries =
        mode === "full"
          ? vocs.filter((v) => v.title.trim()).map((v) => nullIfBlankWorkerDate(v.expiry_date))
          : [];

      const { error: insertError, workerId } = await addWorker(payload, vocExpiries);

      const workerInsertError = scrubPayRuleConditionSaveError(insertError);
      if (workerInsertError) {
        setError(workerInsertError);
        return;
      }

      if (mode === "full" && workerId) {
        const vocItems = vocs.filter((v) => v.title.trim());
        if (vocItems.length > 0) {
          const preparedVocs = await Promise.all(
            vocItems.map(async (voc, i) => ({
              title: voc.title.trim(),
              issuing_org: voc.issuing_org || null,
              issue_date: nullIfBlankWorkerDate(voc.issue_date),
              expiry_date: nullIfBlankWorkerDate(voc.expiry_date),
              document_url: voc.document_url
                ?? (voc.file
                  ? await uploadWorkerDocumentSafe(
                      voc.file,
                      `${uploadPrefix}/vocs/${i}-${voc.title.replace(/[^a-z0-9]/gi, "_")}`
                    )
                  : null),
            }))
          );

          const { error: vocError } = await insertWorkerVocs(workerId, preparedVocs);
          if (vocError) {
            setError(vocError);
            return;
          }
        }
      }

      onSaved();

      const workerEmail = (form.email ?? "").trim();

      try {
        await sendWorkerInviteEmail(workerEmail, workerId ?? undefined);
        showSuccess(`Invitation email sent successfully to ${workerEmail}`);
        window.setTimeout(onClose, 1500);
      } catch (inviteError) {
        const message =
          inviteError instanceof Error
            ? inviteError.message
            : "Worker saved, but the invite email could not be sent.";
        setError(message);
        showError(message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save worker.");
    } finally {
      setSubmitting(false);
    }
  };

  const maxStep = mode === "full" ? fullSteps.length - 1 : 0;

  return (
    <>
    <div className={modalOverlayClass}>
      <div className={cn(modalShellClass, "max-w-xl")}>
        <button
          type="button"
          onClick={onClose}
          className={cn(modalCloseIconButtonClass, "absolute right-3 top-3 z-20")}
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className={cn(modalBodyClass, "pt-10")}>
        <h2 className="text-xl font-bold text-slate-900">Add New Worker</h2>
        <p className="mt-1 text-sm text-slate-500">Worker onboarding</p>

        {/* Mode selector */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => switchMode("quick")}
            className={cn(
              "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition",
              mode === "quick"
                ? "border-orange-500 bg-orange-500/10"
                : "border-slate-200 bg-slate-50 hover:border-slate-300"
            )}
          >
            <UserPlus
              className={cn(
                "h-5 w-5",
                mode === "quick" ? "text-orange-600" : "text-slate-500"
              )}
            />
            <span className="text-sm font-semibold text-slate-900">Quick Invite</span>
            <span className="text-xs text-slate-500">
              Name, email, phone, state/region & project
            </span>
          </button>
          <button
            type="button"
            onClick={() => switchMode("full")}
            className={cn(
              "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition",
              mode === "full"
                ? "border-orange-500 bg-orange-500/10"
                : "border-slate-200 bg-slate-50 hover:border-slate-300"
            )}
          >
            <ClipboardList
              className={cn(
                "h-5 w-5",
                mode === "full" ? "text-orange-600" : "text-slate-500"
              )}
            />
            <span className="text-sm font-semibold text-slate-900">
              Full Admin Onboarding
            </span>
            <span className="text-xs text-slate-500">
              All details & document uploads
            </span>
          </button>
        </div>

        {mode === "full" && (
          <>
            <div className="mt-4 flex gap-1">
              {fullSteps.map((s, i) => (
                <div
                  key={s}
                  className={cn(
                    "h-1 flex-1 rounded-full",
                    i <= step ? "bg-orange-500" : "bg-slate-200"
                  )}
                />
              ))}
            </div>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-orange-500">
              Step {step + 1}: {fullSteps[step]}
            </p>
          </>
        )}

        {error && (
          <p className="mt-3 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        <div className="mt-4 space-y-3">
          {/* Quick Invite */}
          {mode === "quick" && (
            <>
              <Field
                label="First Name"
                required
                fieldId="first_name"
                error={fieldErrors.first_name}
              >
                <input
                  className={inputClass}
                  value={form.first_name ?? ""}
                  onChange={(e) => set("first_name", e.target.value)}
                />
              </Field>
              <Field
                label="Last Name"
                required
                fieldId="last_name"
                error={fieldErrors.last_name}
              >
                <input
                  className={inputClass}
                  value={form.last_name ?? ""}
                  onChange={(e) => set("last_name", e.target.value)}
                />
              </Field>
              <Field
                label="Email"
                required
                fieldId="email"
                error={fieldErrors.email}
              >
                <input
                  type="email"
                  className={inputClass}
                  value={form.email ?? ""}
                  onChange={(e) => set("email", e.target.value)}
                />
              </Field>
              <Field
                label="Phone Number"
                required
                fieldId="phone"
                error={fieldErrors.phone}
              >
                <input
                  type="tel"
                  className={inputClass}
                  value={form.phone ?? ""}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </Field>
              <StateRegionSelector
                id="onboarding-quick-state"
                value={(form.state as WorkerStateRegion | null) ?? null}
                onChange={(value) => set("state", value)}
                disabled={submitting}
                fieldId="state"
                error={fieldErrors.state}
              />
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_apprentice ?? false}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, is_apprentice: event.target.checked }))
                  }
                  disabled={submitting}
                  className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                />
                <span className={labelClass}>Apprentice? (Yes/No)</span>
              </label>
              <WorkerCompanyVehicleFields
                idPrefix="onboarding-quick-company-vehicle"
                hasCompanyVehicle={form.has_company_vehicle ?? false}
                assignedVehicleId={form.assigned_vehicle_asset_id ?? null}
                onHasCompanyVehicleChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    has_company_vehicle: value,
                    assigned_vehicle_asset_id: value
                      ? prev.assigned_vehicle_asset_id ?? null
                      : null,
                  }))
                }
                onAssignedVehicleChange={(vehicleId) =>
                  setForm((prev) => ({
                    ...prev,
                    assigned_vehicle_asset_id: vehicleId,
                  }))
                }
                disabled={submitting}
                fieldId="assigned_vehicle_asset_id"
                error={fieldErrors.assigned_vehicle_asset_id}
              />
              <ProjectSelect
                label="Project Allocation (optional)"
                value={form.assigned_project_id}
                onChange={(id) => set("assigned_project_id", id)}
              />
            </>
          )}

          {/* Full — Step 1: Personal & Emergency */}
          {mode === "full" && step === 0 && (
            <>
              <Field
                label="First Name"
                required
                fieldId="first_name"
                error={fieldErrors.first_name}
              >
                <input
                  className={inputClass}
                  value={form.first_name ?? ""}
                  onChange={(e) => set("first_name", e.target.value)}
                />
              </Field>
              <Field
                label="Last Name"
                required
                fieldId="last_name"
                error={fieldErrors.last_name}
              >
                <input
                  className={inputClass}
                  value={form.last_name ?? ""}
                  onChange={(e) => set("last_name", e.target.value)}
                />
              </Field>
              <Field
                label="Email"
                required
                fieldId="email"
                error={fieldErrors.email}
              >
                <input
                  type="email"
                  className={inputClass}
                  value={form.email ?? ""}
                  onChange={(e) => set("email", e.target.value)}
                />
              </Field>
              <Field
                label="Phone Number"
                required
                fieldId="phone"
                error={fieldErrors.phone}
              >
                <input
                  type="tel"
                  className={inputClass}
                  value={form.phone ?? ""}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </Field>
              <Field
                label="Address Line 1"
                required
                fieldId="address_line_1"
                error={fieldErrors.address_line_1}
              >
                <input
                  className={inputClass}
                  value={form.address_line_1 ?? ""}
                  onChange={(e) => set("address_line_1", e.target.value)}
                  autoComplete="address-line1"
                />
              </Field>
              <Field label="Address Line 2 (Optional)">
                <input
                  className={inputClass}
                  value={form.address_line_2 ?? ""}
                  onChange={(e) => set("address_line_2", e.target.value)}
                  autoComplete="address-line2"
                />
              </Field>
              <Field
                label="Suburb / City"
                required
                fieldId="suburb"
                error={fieldErrors.suburb}
              >
                <input
                  className={inputClass}
                  value={form.suburb ?? ""}
                  onChange={(e) => set("suburb", e.target.value)}
                  autoComplete="address-level2"
                />
              </Field>
              <Field
                label="Postal / Zip Code"
                required
                fieldId="postcode"
                error={fieldErrors.postcode}
              >
                <input
                  className={inputClass}
                  value={form.postcode ?? ""}
                  onChange={(e) => set("postcode", e.target.value)}
                  autoComplete="postal-code"
                />
              </Field>
              <StateRegionSelector
                id="onboarding-full-state"
                value={(form.state as WorkerStateRegion | null) ?? null}
                onChange={(value) => set("state", value)}
                disabled={submitting}
                fieldId="state"
                error={fieldErrors.state}
              />
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_apprentice ?? false}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, is_apprentice: event.target.checked }))
                  }
                  disabled={submitting}
                  className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                />
                <span className={labelClass}>Apprentice? (Yes/No)</span>
              </label>
              <WorkerCompanyVehicleFields
                idPrefix="onboarding-full-company-vehicle"
                hasCompanyVehicle={form.has_company_vehicle ?? false}
                assignedVehicleId={form.assigned_vehicle_asset_id ?? null}
                onHasCompanyVehicleChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    has_company_vehicle: value,
                    assigned_vehicle_asset_id: value
                      ? prev.assigned_vehicle_asset_id ?? null
                      : null,
                  }))
                }
                onAssignedVehicleChange={(vehicleId) =>
                  setForm((prev) => ({
                    ...prev,
                    assigned_vehicle_asset_id: vehicleId,
                  }))
                }
                disabled={submitting}
                fieldId="assigned_vehicle_asset_id"
                error={fieldErrors.assigned_vehicle_asset_id}
              />
              <Field
                label="Date of Birth"
                required
                fieldId="dob"
                error={fieldErrors.dob}
              >
                <input
                  type="date"
                  className={inputClass}
                  value={form.dob ?? ""}
                  onChange={(e) => set("dob", e.target.value)}
                />
              </Field>
              <div className={sectionClass}>
                <h4 className="text-sm font-semibold text-orange-600">
                  Emergency Contact
                </h4>
                <Field
                  label="Contact Name"
                  required
                  fieldId="emergency_contact_name"
                  error={fieldErrors.emergency_contact_name}
                >
                  <input
                    className={inputClass}
                    value={form.emergency_contact_name ?? ""}
                    onChange={(e) => set("emergency_contact_name", e.target.value)}
                  />
                </Field>
                <Field
                  label="Phone Number"
                  required
                  fieldId="emergency_contact_phone"
                  error={fieldErrors.emergency_contact_phone}
                >
                  <input
                    type="tel"
                    className={inputClass}
                    value={form.emergency_contact_phone ?? ""}
                    onChange={(e) => set("emergency_contact_phone", e.target.value)}
                  />
                </Field>
                <Field
                  label="Relationship"
                  required
                  fieldId="emergency_contact_relationship"
                  error={fieldErrors.emergency_contact_relationship}
                >
                  <input
                    className={inputClass}
                    placeholder="e.g. Spouse, Parent"
                    value={form.emergency_contact_relationship ?? ""}
                    onChange={(e) =>
                      set("emergency_contact_relationship", e.target.value)
                    }
                  />
                </Field>
              </div>
            </>
          )}

          {/* Full — Step 2: Tickets & Compliance */}
          {mode === "full" && step === 1 && (
            <div className="space-y-4">
              <DocSection title="White Card">
                <Field
                  label="Card Number"
                  required
                  fieldId="white_card_number"
                  error={fieldErrors.white_card_number}
                >
                  <input
                    className={inputClass}
                    value={form.white_card_number ?? ""}
                    onChange={(e) => set("white_card_number", e.target.value)}
                  />
                </Field>
                <Field
                  label="Issue Date"
                  required
                  fieldId="white_card_issue_date"
                  error={fieldErrors.white_card_issue_date}
                >
                  <input
                    type="date"
                    className={inputClass}
                    value={form.white_card_issue_date ?? ""}
                    onChange={(e) => set("white_card_issue_date", e.target.value)}
                  />
                </Field>
                <DocumentCapture
                  label="White Card Photo"
                  file={docs.white_card}
                  onFileChange={(f) => setDoc("white_card", f)}
                  uploadedUrl={docUrls.white_card}
                  uploadPath={`${uploadPrefix}/white-card`}
                  onUploaded={(url) =>
                    setDocUrls((prev) => ({ ...prev, white_card: url }))
                  }
                  required
                  fieldId="white_card_attachment"
                  error={fieldErrors.white_card_attachment}
                />
              </DocSection>

              <DocSection title="Silica Certificate">
                <Field
                  label="Certificate Number"
                  required
                  fieldId="silica_cert_number"
                  error={fieldErrors.silica_cert_number}
                >
                  <input
                    className={inputClass}
                    value={form.silica_cert_number ?? ""}
                    onChange={(e) => set("silica_cert_number", e.target.value)}
                  />
                </Field>
                <Field
                  label="Issue Date"
                  required
                  fieldId="silica_cert_issue_date"
                  error={fieldErrors.silica_cert_issue_date}
                >
                  <input
                    type="date"
                    className={inputClass}
                    value={form.silica_cert_issue_date ?? ""}
                    onChange={(e) => set("silica_cert_issue_date", e.target.value)}
                  />
                </Field>
                <DocumentCapture
                  label="Silica Certificate Photo"
                  file={docs.silica_cert}
                  onFileChange={(f) => setDoc("silica_cert", f)}
                  uploadedUrl={docUrls.silica_cert}
                  uploadPath={`${uploadPrefix}/silica-cert`}
                  onUploaded={(url) =>
                    setDocUrls((prev) => ({ ...prev, silica_cert: url }))
                  }
                  required
                  fieldId="silica_cert_attachment"
                  error={fieldErrors.silica_cert_attachment}
                />
              </DocSection>

              <DocSection title="Driver's Licence">
                <Field label="Licence Number">
                  <input
                    className={inputClass}
                    value={form.drivers_licence_number ?? ""}
                    onChange={(e) => set("drivers_licence_number", e.target.value)}
                  />
                </Field>
                <Field label="Class">
                  <input
                    className={inputClass}
                    placeholder="e.g. C, MR, HR"
                    value={form.drivers_licence_class ?? ""}
                    onChange={(e) => set("drivers_licence_class", e.target.value)}
                  />
                </Field>
                <Field label="Expiry Date">
                  <input
                    type="date"
                    className={inputClass}
                    value={form.drivers_licence_expiry ?? ""}
                    onChange={(e) => set("drivers_licence_expiry", e.target.value)}
                  />
                </Field>
                <DocumentCapture
                  label="Driver's Licence Photo"
                  file={docs.drivers_licence}
                  onFileChange={(f) => setDoc("drivers_licence", f)}
                  uploadedUrl={docUrls.drivers_licence}
                  uploadPath={`${uploadPrefix}/drivers-licence`}
                  onUploaded={(url) =>
                    setDocUrls((prev) => ({ ...prev, drivers_licence: url }))
                  }
                />
              </DocSection>

              <DocSection title="VOCs (Verification of Competency)">
                <VocListEditor
                  vocs={vocs}
                  onChange={setVocs}
                  minItems={0}
                  uploadPathPrefix={`${uploadPrefix}/vocs`}
                />
              </DocSection>
            </div>
          )}

          {/* Full — Step 3: Financial & Redundancy */}
          {mode === "full" && !hideFinancialFields && step === 2 && (
            <div className="space-y-4">
              <DocSection title="Tax & Banking">
                <Field
                  label="TFN"
                  required
                  fieldId="tfn"
                  error={fieldErrors.tfn}
                >
                  <input
                    className={inputClass}
                    value={form.tfn ?? ""}
                    onChange={(e) => set("tfn", e.target.value)}
                  />
                </Field>
                <Field
                  label="Bank BSB"
                  required
                  fieldId="bank_bsb"
                  error={fieldErrors.bank_bsb}
                >
                  <input
                    className={inputClass}
                    placeholder="000-000"
                    value={form.bank_bsb ?? ""}
                    onChange={(e) => set("bank_bsb", e.target.value)}
                  />
                </Field>
                <Field
                  label="Account Number"
                  required
                  fieldId="bank_account_number"
                  error={fieldErrors.bank_account_number}
                >
                  <input
                    className={inputClass}
                    value={form.bank_account_number ?? ""}
                    onChange={(e) => set("bank_account_number", e.target.value)}
                  />
                </Field>
                <Field
                  label="Bank Name"
                  required
                  fieldId="bank_name"
                  error={fieldErrors.bank_name}
                >
                  <input
                    className={inputClass}
                    value={form.bank_name ?? ""}
                    onChange={(e) => set("bank_name", e.target.value)}
                  />
                </Field>
              </DocSection>

              <DocSection title="Superannuation">
                <Field
                  label="Fund Name"
                  required
                  fieldId="super_fund"
                  error={fieldErrors.super_fund}
                >
                  <input
                    className={inputClass}
                    value={form.super_fund ?? ""}
                    onChange={(e) => set("super_fund", e.target.value)}
                  />
                </Field>
                <Field
                  label="Member Number"
                  required
                  fieldId="super_member_number"
                  error={fieldErrors.super_member_number}
                >
                  <input
                    className={inputClass}
                    value={form.super_member_number ?? ""}
                    onChange={(e) => set("super_member_number", e.target.value)}
                  />
                </Field>
              </DocSection>

              <DocSection title="Redundancy Fund">
                <Field label="Fund Name">
                  <input
                    className={inputClass}
                    value={form.redundancy_fund_name ?? ""}
                    onChange={(e) => set("redundancy_fund_name", e.target.value)}
                  />
                </Field>
                <Field label="Member Number">
                  <input
                    className={inputClass}
                    value={form.redundancy_member_number ?? ""}
                    onChange={(e) =>
                      set("redundancy_member_number", e.target.value)
                    }
                  />
                </Field>
              </DocSection>
            </div>
          )}

          {/* Full — Step 4: Project */}
          {mode === "full" && step === projectStep && (
            <ProjectSelect
              label="Assign to Project (optional)"
              value={form.assigned_project_id}
              onChange={(id) => set("assigned_project_id", id)}
            />
          )}
        </div>

        </div>

        <ModalActionFooter>
        <div className="flex justify-between gap-3 pb-1">
          {mode === "full" ? (
            <>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex min-h-11 items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  disabled={step === 0}
                  className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-orange-50 disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" /> Back
                </button>
              </div>
              {step < maxStep ? (
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                    </>
                  ) : (
                    "Complete Onboarding"
                  )}
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex min-h-11 items-center rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-orange-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Sending Invite…
                  </>
                ) : (
                  "Send Quick Invite"
                )}
              </button>
            </>
          )}
        </div>
        </ModalActionFooter>
      </div>
    </div>
    {toast ? (
      <Toast
        message={toast.message}
        variant={toast.variant}
        onDismiss={dismissToast}
      />
    ) : null}
    </>
  );
}
