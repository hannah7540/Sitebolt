"use client";

import { useRef, useState } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  UserPlus,
} from "lucide-react";
import { addSubcontractorWorkerFromForm } from "@/lib/supabase";
import { uploadWorkerDocumentSafe } from "@/lib/worker-doc-upload";
import type { SubcontractorVocDetail } from "@/lib/subcontractor-worker-payload";
import { cn } from "@/lib/utils";
import {
  inputClass,
  sectionClass,
  modalOverlayClass,
  modalClass,
  labelClass,
} from "@/lib/ui-classes";
import DocumentCapture from "@/components/ui/DocumentCapture";
import VocListEditor from "@/components/workers/VocListEditor";
import { createEmptyVoc, type VocDraft } from "@/lib/voc-utils";

const STEPS = ["Personal & Emergency", "Tickets & Compliance"];

interface DocFiles {
  white_card: File | null;
  silica_cert: File | null;
}

interface DocUrls {
  white_card: string | null;
  silica_cert: string | null;
}

interface AddSubcontractorWorkerModalProps {
  subcontractorId: string;
  onClose: () => void;
  onSaved: () => void;
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

async function prepareVocDetails(
  vocs: VocDraft[],
  uploadPrefix: string
): Promise<SubcontractorVocDetail[]> {
  const vocItems = vocs.filter((voc) => voc.title.trim());
  if (vocItems.length === 0) return [];

  return Promise.all(
    vocItems.map(async (voc, index) => ({
      title: voc.title.trim(),
      issuing_org: voc.issuing_org.trim() || null,
      issue_date: voc.issue_date.trim() || null,
      expiry_date: voc.expiry_date.trim() || null,
      document_url:
        voc.document_url ??
        (voc.file
          ? await uploadWorkerDocumentSafe(
              voc.file,
              `${uploadPrefix}/vocs/${index}-${voc.title.replace(/[^a-z0-9]/gi, "_")}`
            )
          : null),
    }))
  );
}

export default function AddSubcontractorWorkerModal({
  subcontractorId,
  onClose,
  onSaved,
}: AddSubcontractorWorkerModalProps) {
  const [step, setStep] = useState(0);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [emergencyContactRelationship, setEmergencyContactRelationship] =
    useState("");
  const [whiteCardNumber, setWhiteCardNumber] = useState("");
  const [whiteCardIssueDate, setWhiteCardIssueDate] = useState("");
  const [silicaCertNumber, setSilicaCertNumber] = useState("");
  const [silicaCertIssueDate, setSilicaCertIssueDate] = useState("");
  const [docs, setDocs] = useState<DocFiles>({
    white_card: null,
    silica_cert: null,
  });
  const [docUrls, setDocUrls] = useState<DocUrls>({
    white_card: null,
    silica_cert: null,
  });
  const uploadPrefixRef = useRef(
    `subcontractors/${subcontractorId}/workers/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  const uploadPrefix = uploadPrefixRef.current;
  const [vocs, setVocs] = useState<VocDraft[]>([createEmptyVoc()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setDoc = (key: keyof DocFiles, file: File | null) => {
    setDocs((prev) => ({ ...prev, [key]: file }));
  };

  const validateStep = (currentStep: number): string | null => {
    if (currentStep === 0) {
      if (!firstName.trim()) return "First name is required.";
      if (!lastName.trim()) return "Last name is required.";
      if (!email.trim()) return "Email address is required.";
      if (!phone.trim()) return "Mobile phone is required.";
    }
    return null;
  };

  const handleNext = () => {
    const validationError = validateStep(step);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  };

  const handleSubmit = async () => {
    const validationError = validateStep(0);
    if (validationError) {
      setError(validationError);
      setStep(0);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const [whiteCardDocUrl, silicaCertDocUrl, vocDetails] = await Promise.all([
        docUrls.white_card ??
          uploadWorkerDocumentSafe(docs.white_card, `${uploadPrefix}/white-card`),
        docUrls.silica_cert ??
          uploadWorkerDocumentSafe(docs.silica_cert, `${uploadPrefix}/silica-cert`),
        prepareVocDetails(vocs, uploadPrefix),
      ]);

      const { error: insertError, workerId } = await addSubcontractorWorkerFromForm(
        {
          subcontractorId,
          firstName,
          lastName,
          email,
          phone,
          dob,
          emergencyContactName,
          emergencyContactPhone,
          emergencyContactRelationship,
          whiteCardNumber,
          whiteCardIssueDate,
          whiteCardDocUrl,
          silicaCertNumber,
          silicaCertIssueDate,
          silicaCertDocUrl,
          vocDetails,
        }
      );

      if (insertError && !workerId) {
        setError(insertError);
        return;
      }

      if (insertError) {
        setError(insertError);
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save worker.");
    } finally {
      setSubmitting(false);
    }
  };

  const maxStep = STEPS.length - 1;

  return (
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

        <h2 className="text-xl font-bold text-slate-900">Add Subbie Worker</h2>
        <p className="mt-1 text-sm text-slate-500">
          Personal details, emergency contact, and compliance tickets
        </p>

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50/50 p-3">
          <UserPlus className="h-5 w-5 shrink-0 text-orange-600" />
          <p className="text-xs text-slate-600">
            Saves to the workers table with{" "}
            <span className="font-medium">is_subcontractor = true</span>, linked{" "}
            <span className="font-medium">subcontractor_id</span>, and documents
            in worker-docs.
          </p>
        </div>

        <div className="mt-4 flex gap-1">
          {STEPS.map((label, i) => (
            <div
              key={label}
              className={cn(
                "h-1 flex-1 rounded-full",
                i <= step ? "bg-orange-500" : "bg-slate-200"
              )}
              title={label}
            />
          ))}
        </div>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-orange-500">
          Step {step + 1}: {STEPS[step]}
        </p>

        {error && (
          <p className="mt-3 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        <div className="mt-4 max-h-[min(60vh,520px)] space-y-3 overflow-y-auto pr-1">
          {step === 0 && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="First Name *">
                  <input
                    className={inputClass}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Last Name *">
                  <input
                    className={inputClass}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </Field>
              </div>
              <Field label="Mobile Phone *">
                <input
                  type="tel"
                  className={inputClass}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </Field>
              <Field label="Email Address *">
                <input
                  type="email"
                  className={inputClass}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Field>
              <Field label="Date of Birth">
                <input
                  type="date"
                  className={inputClass}
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                />
              </Field>
              <div className={sectionClass}>
                <h4 className="text-sm font-semibold text-orange-600">
                  Emergency Contact
                </h4>
                <Field label="Emergency Contact Name">
                  <input
                    className={inputClass}
                    value={emergencyContactName}
                    onChange={(e) => setEmergencyContactName(e.target.value)}
                  />
                </Field>
                <Field label="Emergency Phone">
                  <input
                    type="tel"
                    className={inputClass}
                    value={emergencyContactPhone}
                    onChange={(e) => setEmergencyContactPhone(e.target.value)}
                  />
                </Field>
                <Field label="Emergency Relationship">
                  <input
                    className={inputClass}
                    placeholder="e.g. Spouse, Parent"
                    value={emergencyContactRelationship}
                    onChange={(e) =>
                      setEmergencyContactRelationship(e.target.value)
                    }
                  />
                </Field>
              </div>
            </>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <DocSection title="White Card">
                <Field label="Card Number">
                  <input
                    className={inputClass}
                    value={whiteCardNumber}
                    onChange={(e) => setWhiteCardNumber(e.target.value)}
                  />
                </Field>
                <Field label="Issue Date">
                  <input
                    type="date"
                    className={inputClass}
                    value={whiteCardIssueDate}
                    onChange={(e) => setWhiteCardIssueDate(e.target.value)}
                  />
                </Field>
                <DocumentCapture
                  label="White Card Photo / Document"
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
                    value={silicaCertNumber}
                    onChange={(e) => setSilicaCertNumber(e.target.value)}
                  />
                </Field>
                <Field label="Issue Date">
                  <input
                    type="date"
                    className={inputClass}
                    value={silicaCertIssueDate}
                    onChange={(e) => setSilicaCertIssueDate(e.target.value)}
                  />
                </Field>
                <DocumentCapture
                  label="Silica Certificate Photo / Document"
                  file={docs.silica_cert}
                  onFileChange={(f) => setDoc("silica_cert", f)}
                  uploadedUrl={docUrls.silica_cert}
                  uploadPath={`${uploadPrefix}/silica-cert`}
                  onUploaded={(url) =>
                    setDocUrls((prev) => ({ ...prev, silica_cert: url }))
                  }
                />
              </DocSection>

              <DocSection title="VOCs (Verification of Competency)">
                <VocListEditor
                  vocs={vocs}
                  onChange={setVocs}
                  uploadPathPrefix={`${uploadPrefix}/vocs`}
                />
              </DocSection>
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            disabled={submitting}
          >
            <ChevronLeft className="h-4 w-4" />
            {step === 0 ? "Cancel" : "Back"}
          </button>

          {step < maxStep ? (
            <button
              type="button"
              onClick={handleNext}
              className="inline-flex items-center gap-1 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save Worker"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
