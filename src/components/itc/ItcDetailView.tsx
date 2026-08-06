"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, FileDown, Loader2 } from "lucide-react";
import SignatureCanvas from "@/components/prestart/SignatureCanvas";
import ItcPhotoRecordBlock from "@/components/itc/ItcPhotoRecordBlock";
import {
  createItcChangeRequest,
  submitItcSignoff,
  upsertItcSignoffDraft,
  type ItcDetailBundle,
  type ItcSignoff,
} from "@/lib/itc-service";
import { downloadItcPdf, generateItcCertificatePdf } from "@/lib/itc-pdf";
import { uploadItcSignature } from "@/lib/itc-upload";
import { cardClass, inputClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface ItcDetailViewProps {
  projectId: string;
  projectName: string;
  bundle: ItcDetailBundle;
  workerId: string;
  workerName: string;
  onBack: () => void;
  onUpdated: () => void;
}

function getSignoffForStep(
  signoffs: ItcSignoff[],
  stepIndex: number,
  authorId: string
): ItcSignoff | undefined {
  return signoffs.find(
    (row) => row.step_index === stepIndex && row.author_id === authorId
  );
}

export default function ItcDetailView({
  projectId,
  projectName,
  bundle,
  workerId,
  workerName,
  onBack,
  onUpdated,
}: ItcDetailViewProps) {
  const { itc, photos, signoffs, changeRequests, steps } = bundle;
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [comments, setComments] = useState("");
  const [fieldData, setFieldData] = useState<Record<string, string>>({});
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const activeStep = steps[activeStepIndex];
  const activeSignoff = useMemo(
    () => getSignoffForStep(signoffs, activeStep?.step_index ?? 0, workerId),
    [signoffs, activeStep?.step_index, workerId]
  );

  const isLocked = activeSignoff?.status === "submitted";

  const handleSaveDraft = async () => {
    if (!activeStep) return;
    setLoading(true);
    setMessage(null);

    let signatureUrl = activeSignoff?.signature_url ?? null;
    if (signatureDataUrl) {
      const blob = await fetch(signatureDataUrl).then((response) => response.blob());
      const upload = await uploadItcSignature({
        projectId,
        itcId: itc.id,
        stepKey: activeStep.step_key,
        blob,
      });
      signatureUrl = upload.url;
    }

    const result = await upsertItcSignoffDraft({
      itcId: itc.id,
      stepKey: activeStep.step_key,
      stepIndex: activeStep.step_index,
      authorId: workerId,
      authorName: workerName,
      comments,
      fieldData,
      signatureUrl,
    });

    setLoading(false);
    setMessage(result.error ?? "Draft saved.");
    if (!result.error) onUpdated();
  };

  const handleSubmit = async () => {
    if (!activeStep) return;
    setLoading(true);
    setMessage(null);

    let signatureUrl = activeSignoff?.signature_url ?? null;
    if (signatureDataUrl) {
      const blob = await fetch(signatureDataUrl).then((response) => response.blob());
      const upload = await uploadItcSignature({
        projectId,
        itcId: itc.id,
        stepKey: activeStep.step_key,
        blob,
      });
      signatureUrl = upload.url;
    }

    const draft = await upsertItcSignoffDraft({
      itcId: itc.id,
      stepKey: activeStep.step_key,
      stepIndex: activeStep.step_index,
      authorId: workerId,
      authorName: workerName,
      comments,
      fieldData,
      signatureUrl,
    });

    if (draft.error || !draft.signoff) {
      setLoading(false);
      setMessage(draft.error ?? "Save draft before submitting.");
      return;
    }

    const result = await submitItcSignoff({
      signoffId: draft.signoff.id,
      itcId: itc.id,
    });
    setLoading(false);
    setMessage(result.error ?? "Sign-off submitted and locked.");
    if (!result.error) onUpdated();
  };

  const handleChangeRequest = async () => {
    const reason = window.prompt("Describe the required change:");
    if (!reason?.trim()) return;

    setLoading(true);
    const result = await createItcChangeRequest({
      itcId: itc.id,
      signoffId: activeSignoff?.id ?? null,
      requestedBy: workerId,
      requestedByName: workerName,
      reason: reason.trim(),
    });
    setLoading(false);
    setMessage(result.error ?? "Change request sent to admin queue.");
    if (!result.error) onUpdated();
  };

  const handleGeneratePdf = async () => {
    setPdfLoading(true);
    try {
      const blob = await generateItcCertificatePdf(bundle, projectName);
      downloadItcPdf(blob, `${itc.itc_number}-certificate.pdf`);
    } finally {
      setPdfLoading(false);
    }
  };

  const renderConditionalFields = () => {
    const spec = activeStep?.field_spec ?? {};
    const type = String(spec.type ?? "checklist");

    if (type === "survey") {
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Rover</span>
            <select
              value={fieldData.rover_id ?? ""}
              disabled={isLocked}
              onChange={(e) => setFieldData((current) => ({ ...current, rover_id: e.target.value }))}
              className={inputClass}
            >
              <option value="">Select rover</option>
              <option value="rover-1">Rover 01</option>
              <option value="rover-2">Rover 02</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Operator</span>
            <input
              value={fieldData.operator_name ?? ""}
              disabled={isLocked}
              onChange={(e) =>
                setFieldData((current) => ({ ...current, operator_name: e.target.value }))
              }
              className={inputClass}
            />
          </label>
        </div>
      );
    }

    if (type === "compaction") {
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Compaction Test #
            </span>
            <input
              value={fieldData.test_number ?? ""}
              disabled={isLocked}
              onChange={(e) =>
                setFieldData((current) => ({ ...current, test_number: e.target.value }))
              }
              className={inputClass}
              placeholder="CT-2026-014"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Company</span>
            <input
              value={fieldData.company_name ?? ""}
              disabled={isLocked}
              onChange={(e) =>
                setFieldData((current) => ({ ...current, company_name: e.target.value }))
              }
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Technician</span>
            <input
              value={fieldData.technician_name ?? ""}
              disabled={isLocked}
              onChange={(e) =>
                setFieldData((current) => ({ ...current, technician_name: e.target.value }))
              }
              className={inputClass}
            />
          </label>
        </div>
      );
    }

    if (type === "cctv") {
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Outcome</span>
            <select
              value={fieldData.outcome ?? ""}
              disabled={isLocked}
              onChange={(e) => setFieldData((current) => ({ ...current, outcome: e.target.value }))}
              className={inputClass}
            >
              <option value="">Select</option>
              <option value="Pass">Pass</option>
              <option value="Fail">Fail</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Return</span>
            <select
              value={fieldData.return_required ?? ""}
              disabled={isLocked}
              onChange={(e) =>
                setFieldData((current) => ({ ...current, return_required: e.target.value }))
              }
              className={inputClass}
            >
              <option value="">Select</option>
              <option value="Return Required">Return Required</option>
              <option value="Not Required">Not Required</option>
            </select>
          </label>
        </div>
      );
    }

    return (
      <p className="text-sm text-slate-600">
        Confirm checklist requirements for this step before signing.
      </p>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Register
        </button>
        <button
          type="button"
          onClick={() => void handleGeneratePdf()}
          disabled={pdfLoading}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
        >
          {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
          Generate PDF
        </button>
      </div>

      <div className={cardClass}>
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-xl font-bold text-slate-900">{itc.itc_number}</h2>
          <p className="text-sm text-slate-500">
            {itc.zone_code} · {itc.building ?? "General"} · {itc.start_location} →{" "}
            {itc.end_location}
          </p>
        </div>
      </div>

      <ItcPhotoRecordBlock
        projectId={projectId}
        itcId={itc.id}
        photos={photos}
        uploadedBy={workerName}
        onUpdated={onUpdated}
      />

      <div className={cardClass}>
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="font-semibold text-slate-900">Step Sign-Offs (Append-Only)</h3>
          <p className="text-xs text-slate-500">
            Draft entries are editable by the author until submission locks the record.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-200 px-4 py-3">
          {steps.map((step, index) => {
            const signoff = getSignoffForStep(signoffs, step.step_index, workerId);
            return (
              <button
                key={step.step_key}
                type="button"
                onClick={() => {
                  setActiveStepIndex(index);
                  setComments(signoff?.comments ?? "");
                  setFieldData(
                    Object.fromEntries(
                      Object.entries(signoff?.field_data ?? {}).map(([key, value]) => [
                        key,
                        String(value),
                      ])
                    )
                  );
                  setSignatureDataUrl(null);
                }}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold",
                  activeStepIndex === index
                    ? "bg-orange-600 text-white"
                    : "bg-slate-100 text-slate-700",
                  signoff?.status === "submitted" && "ring-2 ring-emerald-300"
                )}
              >
                {index + 1}. {step.title}
              </button>
            );
          })}
        </div>

        <div className="space-y-4 p-4">
          <div>
            <h4 className="font-semibold text-slate-900">{activeStep?.title}</h4>
            <p className="text-sm text-slate-500">{activeStep?.description}</p>
          </div>

          {renderConditionalFields()}

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Comments</span>
            <textarea
              value={comments}
              disabled={isLocked}
              onChange={(e) => setComments(e.target.value)}
              rows={3}
              className={inputClass}
            />
          </label>

          {!isLocked ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Signature</p>
              <SignatureCanvas onChange={setSignatureDataUrl} />
            </div>
          ) : (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Submitted {activeSignoff?.submitted_at ? new Date(activeSignoff.submitted_at).toLocaleString() : ""}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {!isLocked ? (
              <>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void handleSaveDraft()}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void handleSubmit()}
                  className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  Submit & Lock
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleChangeRequest()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Request Change
              </button>
            )}
          </div>

          {changeRequests.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {changeRequests.length} open change request(s) on this ITC.
            </div>
          ) : null}

          {message ? <p className="text-sm text-slate-600">{message}</p> : null}
        </div>
      </div>
    </div>
  );
}
