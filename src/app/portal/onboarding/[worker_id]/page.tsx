"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  HardHat,
  Loader2,
  ChevronRight,
  ChevronLeft,
  CheckCircle,
} from "lucide-react";
import {
  fetchWorkerById,
  insertWorkerVocs,
  isSupabaseConfigured,
  updateWorker,
  updateWorkerStatusFromVocs,
  type Worker,
} from "@/lib/supabase";
import {
  uploadWorkerDocumentSafe,
  uploadWorkerSignature,
} from "@/lib/worker-doc-upload";
import { computeWorkerStatusFromExpiries, nullIfBlankWorkerDate } from "@/lib/worker-utils";
import { assignDefaultPayRuleToWorker } from "@/lib/worker-pay-rule-assignment";
import DocumentCapture from "@/components/ui/DocumentCapture";
import SignatureCanvas from "@/components/prestart/SignatureCanvas";
import VocListEditor from "@/components/workers/VocListEditor";
import StateRegionSelector from "@/components/workers/StateRegionSelector";
import { createEmptyVoc, type VocDraft } from "@/lib/voc-utils";
import {
  normalizeWorkerStateRegion,
  type WorkerStateRegion,
} from "@/lib/worker-state-region";
import { cardClass, inputClass, labelClass, sectionClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

const STEPS = [
  "Your Profile",
  "Emergency Contact",
  "Compliance Documents",
  "VOCs",
  "Signature",
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

export default function WorkerInductionPortalPage() {
  const params = useParams();
  const workerId = params.worker_id as string;

  const [worker, setWorker] = useState<Worker | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [stateRegion, setStateRegion] = useState<WorkerStateRegion | null>(null);
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [emergencyRelationship, setEmergencyRelationship] = useState("");

  const [whiteCardNumber, setWhiteCardNumber] = useState("");
  const [whiteCardIssueDate, setWhiteCardIssueDate] = useState("");
  const [licenceNumber, setLicenceNumber] = useState("");
  const [licenceClass, setLicenceClass] = useState("");
  const [licenceExpiry, setLicenceExpiry] = useState("");
  const [silicaNumber, setSilicaNumber] = useState("");
  const [silicaIssueDate, setSilicaIssueDate] = useState("");

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

  const [vocs, setVocs] = useState<VocDraft[]>([createEmptyVoc()]);
  const [signature, setSignature] = useState<string | null>(null);

  const uploadPrefixRef = useRef(
    `portal/${workerId}/${Date.now()}`
  );
  const uploadPrefix = uploadPrefixRef.current;

  useEffect(() => {
    if (!workerId || !isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    fetchWorkerById(workerId).then((w) => {
      if (w) {
        setWorker(w);
        setPhone(w.phone ?? "");
        setDob(w.dob ?? "");
        setStateRegion(normalizeWorkerStateRegion(w.state));
        setEmergencyName(w.emergency_contact_name ?? "");
        setEmergencyPhone(w.emergency_contact_phone ?? "");
        setEmergencyRelationship(w.emergency_contact_relationship ?? "");
        setWhiteCardNumber(w.white_card_number ?? "");
        setWhiteCardIssueDate(w.white_card_issue_date ?? "");
        setLicenceNumber(w.drivers_licence_number ?? "");
        setLicenceClass(w.drivers_licence_class ?? "");
        setLicenceExpiry(w.drivers_licence_expiry ?? "");
        setSilicaNumber(w.silica_cert_number ?? "");
        setSilicaIssueDate(w.silica_cert_issue_date ?? "");
        setDocUrls({
          white_card: w.white_card_photo_url,
          silica_cert: w.silica_cert_photo_url,
          drivers_licence: w.drivers_licence_photo_url,
        });
        if (w.induction_completed_at) setSuccess(true);
      }
      setLoading(false);
    });
  }, [workerId]);

  const setDoc = (key: keyof DocFiles, file: File | null) => {
    setDocs((prev) => ({ ...prev, [key]: file }));
  };

  const validateStep = (): string | null => {
    switch (step) {
      case 0:
        if (!phone.trim()) return "Phone number is required.";
        if (!stateRegion) return "State / Region is required.";
        return null;
      case 1:
        if (!emergencyName.trim()) return "Emergency contact name is required.";
        if (!emergencyPhone.trim()) return "Emergency contact phone is required.";
        if (!emergencyRelationship.trim())
          return "Emergency contact relationship is required.";
        return null;
      case 2: {
        const hasWhiteCard =
          docUrls.white_card || docs.white_card;
        const hasLicence =
          docUrls.drivers_licence || docs.drivers_licence;
        if (!hasWhiteCard) return "Please capture or upload your White Card.";
        if (!hasLicence)
          return "Please capture or upload your Driver's Licence.";
        return null;
      }
      case 4:
        if (!signature) return "Please sign to complete your induction.";
        return null;
      default:
        return null;
    }
  };

  const handleNext = () => {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const handleSubmit = async () => {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    if (!worker) return;

    setSubmitting(true);
    setError(null);

    try {
      const [whiteCardUrl, silicaUrl, licenceUrl, signatureUrl] =
        await Promise.all([
          docUrls.white_card ??
            uploadWorkerDocumentSafe(docs.white_card, `${uploadPrefix}/white-card`),
          docUrls.silica_cert ??
            uploadWorkerDocumentSafe(docs.silica_cert, `${uploadPrefix}/silica-cert`),
          docUrls.drivers_licence ??
            uploadWorkerDocumentSafe(
              docs.drivers_licence,
              `${uploadPrefix}/drivers-licence`
            ),
          signature
            ? uploadWorkerSignature(signature, `${uploadPrefix}/signature`)
            : Promise.resolve(null),
        ]);

      const vocItems = vocs.filter((v) => v.title.trim());
      const preparedVocs = await Promise.all(
        vocItems.map(async (voc, i) => ({
          title: voc.title.trim(),
          issuing_org: voc.issuing_org || null,
          issue_date: nullIfBlankWorkerDate(voc.issue_date),
          expiry_date: nullIfBlankWorkerDate(voc.expiry_date),
          document_url:
            voc.document_url ??
            (voc.file
              ? await uploadWorkerDocumentSafe(
                  voc.file,
                  `${uploadPrefix}/vocs/${i}-${voc.title.replace(/[^a-z0-9]/gi, "_")}`
                )
              : null),
        }))
      );

      const status = computeWorkerStatusFromExpiries([
        nullIfBlankWorkerDate(licenceExpiry),
        ...preparedVocs.map((v) => v.expiry_date),
      ]);

      const { error: updateError } = await updateWorker(workerId, {
        phone: phone.trim() || null,
        dob: nullIfBlankWorkerDate(dob),
        state: stateRegion,
        emergency_contact_name: emergencyName.trim(),
        emergency_contact_phone: emergencyPhone.trim(),
        emergency_contact_relationship: emergencyRelationship.trim(),
        white_card_number: whiteCardNumber || null,
        white_card_issue_date: nullIfBlankWorkerDate(whiteCardIssueDate),
        white_card_photo_url: whiteCardUrl,
        drivers_licence_number: licenceNumber || null,
        drivers_licence_class: licenceClass || null,
        drivers_licence_expiry: nullIfBlankWorkerDate(licenceExpiry),
        drivers_licence_photo_url: licenceUrl,
        silica_cert_number: silicaNumber || null,
        silica_cert_issue_date: nullIfBlankWorkerDate(silicaIssueDate),
        silica_cert_photo_url: silicaUrl,
        induction_signature_url: signatureUrl,
        induction_completed_at: new Date().toISOString(),
        status: status === "expired_ticket" ? "expired_ticket" : "active",
      });

      if (updateError) {
        setError(updateError);
        return;
      }

      if (stateRegion) {
        const payRuleResult = await assignDefaultPayRuleToWorker(
          workerId,
          stateRegion
        );
        if (payRuleResult.error) {
          setError(payRuleResult.error);
          return;
        }
      }

      if (preparedVocs.length > 0) {
        const { error: vocError } = await insertWorkerVocs(workerId, preparedVocs);
        if (vocError) {
          setError(vocError);
          return;
        }
      }

      await updateWorkerStatusFromVocs(
        workerId,
        nullIfBlankWorkerDate(licenceExpiry),
        preparedVocs.map((v) => v.expiry_date)
      );

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit induction.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isSupabaseConfigured()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-transparent p-6">
        <p className="text-amber-800">Supabase is not configured.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-transparent">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!worker) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-transparent p-6">
        <p className="text-slate-600">Worker profile not found.</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-transparent p-6 text-center">
        <CheckCircle className="mb-4 h-16 w-16 text-emerald-500" />
        <h1 className="text-2xl font-bold text-slate-900">Induction Complete</h1>
        <p className="mt-2 max-w-sm text-slate-600">
          Thank you, {worker.full_name}. Your details and documents have been submitted
          successfully.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-4 shadow-sm">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500">
            <HardHat className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">
              SiteBolt Induction
            </p>
            <h1 className="text-lg font-bold text-slate-900">{worker.full_name}</h1>
          </div>
        </div>
        <div className="mx-auto mt-3 flex max-w-lg gap-1">
          {STEPS.map((_, i) => (
            <div
              key={STEPS[i]}
              className={cn(
                "h-1 flex-1 rounded-full",
                i <= step ? "bg-orange-500" : "bg-slate-200"
              )}
            />
          ))}
        </div>
        <p className="mx-auto mt-2 max-w-lg text-xs font-medium text-slate-500">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </p>
      </header>

      <main className="mx-auto max-w-lg space-y-4 p-4 pb-28">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {step === 0 && (
          <div className={cn(cardClass, "space-y-4 p-4")}>
            <h2 className="text-base font-semibold text-slate-900">Your Profile</h2>
            <div className="rounded-lg bg-white p-3 text-sm">
              <p>
                <span className="text-slate-500">Name: </span>
                <span className="font-medium text-slate-900">{worker.full_name}</span>
              </p>
              <p className="mt-1">
                <span className="text-slate-500">Email: </span>
                <span className="text-slate-800">{worker.email}</span>
              </p>
            </div>
            <Field label="Phone Number *">
              <input
                type="tel"
                className={inputClass}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
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
            <StateRegionSelector
              id="portal-onboarding-state"
              value={stateRegion}
              onChange={setStateRegion}
              disabled={submitting}
            />
          </div>
        )}

        {step === 1 && (
          <div className={cn(sectionClass, "p-4")}>
            <h2 className="text-base font-semibold text-orange-600">
              Emergency Contact
            </h2>
            <Field label="Contact Name *">
              <input
                className={inputClass}
                value={emergencyName}
                onChange={(e) => setEmergencyName(e.target.value)}
              />
            </Field>
            <Field label="Phone Number *">
              <input
                type="tel"
                className={inputClass}
                value={emergencyPhone}
                onChange={(e) => setEmergencyPhone(e.target.value)}
              />
            </Field>
            <Field label="Relationship *">
              <input
                className={inputClass}
                placeholder="e.g. Spouse, Parent"
                value={emergencyRelationship}
                onChange={(e) => setEmergencyRelationship(e.target.value)}
              />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className={sectionClass}>
              <h2 className="text-base font-semibold text-orange-600">White Card</h2>
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
                label="White Card Photo *"
                file={docs.white_card}
                onFileChange={(f) => setDoc("white_card", f)}
                existingUrl={worker.white_card_photo_url}
                uploadedUrl={docUrls.white_card}
                uploadPath={`${uploadPrefix}/white-card`}
                onUploaded={(url) =>
                  setDocUrls((prev) => ({ ...prev, white_card: url }))
                }
              />
            </div>

            <div className={sectionClass}>
              <h2 className="text-base font-semibold text-orange-600">
                Driver&apos;s Licence
              </h2>
              <Field label="Licence Number">
                <input
                  className={inputClass}
                  value={licenceNumber}
                  onChange={(e) => setLicenceNumber(e.target.value)}
                />
              </Field>
              <Field label="Class">
                <input
                  className={inputClass}
                  placeholder="e.g. C, MR, HR"
                  value={licenceClass}
                  onChange={(e) => setLicenceClass(e.target.value)}
                />
              </Field>
              <Field label="Expiry Date">
                <input
                  type="date"
                  className={inputClass}
                  value={licenceExpiry}
                  onChange={(e) => setLicenceExpiry(e.target.value)}
                />
              </Field>
              <DocumentCapture
                label="Licence Photo *"
                file={docs.drivers_licence}
                onFileChange={(f) => setDoc("drivers_licence", f)}
                existingUrl={worker.drivers_licence_photo_url}
                uploadedUrl={docUrls.drivers_licence}
                uploadPath={`${uploadPrefix}/drivers-licence`}
                onUploaded={(url) =>
                  setDocUrls((prev) => ({ ...prev, drivers_licence: url }))
                }
              />
            </div>

            <div className={sectionClass}>
              <h2 className="text-base font-semibold text-orange-600">
                Silica Certificate
              </h2>
              <Field label="Certificate Number">
                <input
                  className={inputClass}
                  value={silicaNumber}
                  onChange={(e) => setSilicaNumber(e.target.value)}
                />
              </Field>
              <Field label="Issue Date">
                <input
                  type="date"
                  className={inputClass}
                  value={silicaIssueDate}
                  onChange={(e) => setSilicaIssueDate(e.target.value)}
                />
              </Field>
              <DocumentCapture
                label="Silica Certificate Photo"
                file={docs.silica_cert}
                onFileChange={(f) => setDoc("silica_cert", f)}
                existingUrl={worker.silica_cert_photo_url}
                uploadedUrl={docUrls.silica_cert}
                uploadPath={`${uploadPrefix}/silica-cert`}
                onUploaded={(url) =>
                  setDocUrls((prev) => ({ ...prev, silica_cert: url }))
                }
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className={cn(cardClass, "p-4")}>
            <h2 className="mb-3 text-base font-semibold text-slate-900">
              VOCs (Verification of Competency)
            </h2>
            <p className="mb-4 text-sm text-slate-500">
              Add any machine competencies or licences you hold. Tap Take Photo on
              mobile to use your camera.
            </p>
            <VocListEditor
              vocs={vocs}
              onChange={setVocs}
              minItems={0}
              uploadPathPrefix={`${uploadPrefix}/vocs`}
            />
          </div>
        )}

        {step === 4 && (
          <div className={cn(cardClass, "space-y-4 p-4")}>
            <h2 className="text-base font-semibold text-slate-900">
              Sign Your Induction
            </h2>
            <p className="text-sm text-slate-500">
              By signing below, you confirm the information and documents provided are
              accurate.
            </p>
            <SignatureCanvas onChange={setSignature} />
          </div>
        )}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white p-4 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
        <div className="mx-auto flex max-w-lg gap-3">
          {step > 0 && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep((s) => s - 1);
              }}
              className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-slate-100 py-3 text-sm font-semibold text-slate-700"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={handleNext}
              className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white shadow-sm"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Submitting…
                </>
              ) : (
                "Complete Induction"
              )}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
