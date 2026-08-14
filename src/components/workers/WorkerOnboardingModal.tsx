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
import ProjectSelect from "@/components/ui/ProjectSelect";
import { cn } from "@/lib/utils";
import {
  inputClass,
  sectionClass,
  modalOverlayClass,
  modalClass,
  labelClass,
} from "@/lib/ui-classes";
import DocumentCapture from "@/components/ui/DocumentCapture";
import VocListEditor from "./VocListEditor";
import StateRegionSelector from "./StateRegionSelector";
import WorkerCompanyVehicleFields from "./WorkerCompanyVehicleFields";
import { createEmptyVoc, type VocDraft } from "@/lib/voc-utils";
import type { WorkerStateRegion } from "@/lib/worker-state-region";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";

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
  super_usi: "",
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
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className={labelClass}>{label}</span>
      {children}
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
  };

  const validateCurrentStep = (): string | null => {
    if (mode === "quick") {
      if (!form.first_name?.trim() || !form.last_name?.trim() || !form.email?.trim()) {
        return "First name, last name, and email are required.";
      }
      if (!form.state) return "State / Region is required.";
      if (form.has_company_vehicle && !form.assigned_vehicle_asset_id) {
        return "Please select a company vehicle.";
      }
      return null;
    }

    if (step === 0) {
      if (!form.first_name?.trim() || !form.last_name?.trim() || !form.email?.trim()) {
        return "First name, last name, and email are required.";
      }
      if (!form.state) return "State / Region is required.";
      if (form.has_company_vehicle && !form.assigned_vehicle_asset_id) {
        return "Please select a company vehicle.";
      }
    }

    return null;
  };

  const handleNextStep = () => {
    const stepError = validateCurrentStep();
    if (stepError) {
      setError(stepError);
      return;
    }
    setError(null);
    setStep((s) => s + 1);
  };

  const sendWorkerInviteEmail = async (email: string, workerId?: string) => {
    await requestWorkerAuthInvite(email, workerId);
  };

  const handleSubmit = async () => {
    const stepError = validateCurrentStep();
    if (stepError) {
      setError(stepError);
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
      };

      if (mode === "full") {
        Object.assign(payload, {
          ...form,
          first_name: (form.first_name ?? "").trim(),
          last_name: (form.last_name ?? "").trim(),
          email: (form.email ?? "").trim(),
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

      const vocExpiries =
        mode === "full"
          ? vocs.filter((v) => v.title.trim()).map((v) => nullIfBlankWorkerDate(v.expiry_date))
          : [];

      const { error: insertError, workerId } = await addWorker(payload, vocExpiries);

      if (insertError) {
        setError(insertError);
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
        showSuccess(
          "Invite sent! Worker will receive an email to set their password."
        );
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
      <div className={cn(modalClass, "max-w-xl")}>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-500 hover:text-slate-900"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

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
              <Field label="First Name *">
                <input
                  className={inputClass}
                  value={form.first_name ?? ""}
                  onChange={(e) => set("first_name", e.target.value)}
                  required
                />
              </Field>
              <Field label="Last Name *">
                <input
                  className={inputClass}
                  value={form.last_name ?? ""}
                  onChange={(e) => set("last_name", e.target.value)}
                  required
                />
              </Field>
              <Field label="Email *">
                <input
                  type="email"
                  className={inputClass}
                  value={form.email ?? ""}
                  onChange={(e) => set("email", e.target.value)}
                  required
                />
              </Field>
              <Field label="Phone Number">
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
              <Field label="First Name *">
                <input
                  className={inputClass}
                  value={form.first_name ?? ""}
                  onChange={(e) => set("first_name", e.target.value)}
                  required
                />
              </Field>
              <Field label="Last Name *">
                <input
                  className={inputClass}
                  value={form.last_name ?? ""}
                  onChange={(e) => set("last_name", e.target.value)}
                  required
                />
              </Field>
              <Field label="Email *">
                <input
                  type="email"
                  className={inputClass}
                  value={form.email ?? ""}
                  onChange={(e) => set("email", e.target.value)}
                />
              </Field>
              <Field label="Phone Number">
                <input
                  type="tel"
                  className={inputClass}
                  value={form.phone ?? ""}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </Field>
              <StateRegionSelector
                id="onboarding-full-state"
                value={(form.state as WorkerStateRegion | null) ?? null}
                onChange={(value) => set("state", value)}
                disabled={submitting}
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
              />
              <Field label="Date of Birth">
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
                <Field label="Contact Name">
                  <input
                    className={inputClass}
                    value={form.emergency_contact_name ?? ""}
                    onChange={(e) => set("emergency_contact_name", e.target.value)}
                  />
                </Field>
                <Field label="Phone Number">
                  <input
                    type="tel"
                    className={inputClass}
                    value={form.emergency_contact_phone ?? ""}
                    onChange={(e) => set("emergency_contact_phone", e.target.value)}
                  />
                </Field>
                <Field label="Relationship">
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
                <Field label="Card Number">
                  <input
                    className={inputClass}
                    value={form.white_card_number ?? ""}
                    onChange={(e) => set("white_card_number", e.target.value)}
                  />
                </Field>
                <Field label="Issue Date">
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
                />
              </DocSection>

              <DocSection title="Silica Certificate">
                <Field label="Certificate Number">
                  <input
                    className={inputClass}
                    value={form.silica_cert_number ?? ""}
                    onChange={(e) => set("silica_cert_number", e.target.value)}
                  />
                </Field>
                <Field label="Issue Date">
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
                <Field label="TFN">
                  <input
                    className={inputClass}
                    value={form.tfn ?? ""}
                    onChange={(e) => set("tfn", e.target.value)}
                  />
                </Field>
                <Field label="Bank BSB">
                  <input
                    className={inputClass}
                    placeholder="000-000"
                    value={form.bank_bsb ?? ""}
                    onChange={(e) => set("bank_bsb", e.target.value)}
                  />
                </Field>
                <Field label="Account Number">
                  <input
                    className={inputClass}
                    value={form.bank_account_number ?? ""}
                    onChange={(e) => set("bank_account_number", e.target.value)}
                  />
                </Field>
                <Field label="Bank Name">
                  <input
                    className={inputClass}
                    value={form.bank_name ?? ""}
                    onChange={(e) => set("bank_name", e.target.value)}
                  />
                </Field>
              </DocSection>

              <DocSection title="Superannuation">
                <Field label="Fund Name">
                  <input
                    className={inputClass}
                    value={form.super_fund ?? ""}
                    onChange={(e) => set("super_fund", e.target.value)}
                  />
                </Field>
                <Field label="Member Number">
                  <input
                    className={inputClass}
                    value={form.super_member_number ?? ""}
                    onChange={(e) => set("super_member_number", e.target.value)}
                  />
                </Field>
                <Field label="USI">
                  <input
                    className={inputClass}
                    value={form.super_usi ?? ""}
                    onChange={(e) => set("super_usi", e.target.value)}
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

        <div className="mt-6 flex justify-between gap-3">
          {mode === "full" ? (
            <>
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                className="flex items-center gap-1 rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-600 hover:bg-orange-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
              {step < maxStep ? (
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="flex items-center gap-1 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
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
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-600 hover:bg-orange-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
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
