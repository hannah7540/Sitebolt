"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Lock } from "lucide-react";
import SignatureCanvas from "@/components/prestart/SignatureCanvas";
import {
  submitItcSignoff,
  upsertItcSignoffDraft,
  type ItcSignoff,
} from "@/lib/itc-service";
import { uploadItcSignature } from "@/lib/itc-upload";
import type { ItcFormStepTemplate } from "@/lib/itc-templates";
import { isItcStepUnlocked } from "@/lib/itc-templates";
import { cardClass, inputClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface ItcStepSignoffCardProps {
  projectId: string;
  itcId: string;
  step: ItcFormStepTemplate;
  stepNumber: number;
  signoff: ItcSignoff | undefined;
  allSignoffs: ItcSignoff[];
  workerId: string;
  workerName: string;
  roverOptions: string[];
  operatorOptions: string[];
  onUpdated: () => void;
  onChangeRequest: () => void;
}

export default function ItcStepSignoffCard({
  projectId,
  itcId,
  step,
  stepNumber,
  signoff,
  allSignoffs,
  workerId,
  workerName,
  roverOptions,
  operatorOptions,
  onUpdated,
  onChangeRequest,
}: ItcStepSignoffCardProps) {
  const [comments, setComments] = useState(signoff?.comments ?? "");
  const [fieldData, setFieldData] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(signoff?.field_data ?? {}).map(([key, value]) => [key, String(value)])
    )
  );
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setComments(signoff?.comments ?? "");
    setFieldData(
      Object.fromEntries(
        Object.entries(signoff?.field_data ?? {}).map(([key, value]) => [key, String(value)])
      )
    );
    setSignatureDataUrl(null);
    setMessage(null);
  }, [signoff?.id, signoff?.comments, signoff?.field_data, signoff?.status]);

  const isSubmitted = signoff?.status === "submitted";
  const isUnlocked = useMemo(
    () => isItcStepUnlocked(step.step_index, allSignoffs, workerId),
    [step.step_index, allSignoffs, workerId]
  );
  const isLocked = isSubmitted || !isUnlocked;

  const renderConditionalFields = () => {
    const spec = step.field_spec ?? {};
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
              {roverOptions.map((rover) => (
                <option key={rover} value={rover}>
                  {rover}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Operator</span>
            <input
              list={`itc-rover-operators-${step.step_key}`}
              value={fieldData.operator_name ?? ""}
              disabled={isLocked}
              onChange={(e) =>
                setFieldData((current) => ({ ...current, operator_name: e.target.value }))
              }
              className={inputClass}
            />
            <datalist id={`itc-rover-operators-${step.step_key}`}>
              {operatorOptions.map((operator) => (
                <option key={operator} value={operator} />
              ))}
            </datalist>
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

    return null;
  };

  const persistDraft = async (): Promise<{ error: string | null; signatureUrl: string | null }> => {
    let signatureUrl = signoff?.signature_url ?? null;
    if (signatureDataUrl) {
      const blob = await fetch(signatureDataUrl).then((response) => response.blob());
      const upload = await uploadItcSignature({
        projectId,
        itcId,
        stepKey: step.step_key,
        blob,
      });
      if (!upload.url) {
        return { error: upload.error ?? "Failed to upload signature.", signatureUrl: null };
      }
      signatureUrl = upload.url;
    }

    const result = await upsertItcSignoffDraft({
      itcId,
      stepKey: step.step_key,
      stepIndex: step.step_index,
      authorId: workerId,
      authorName: workerName,
      comments,
      fieldData,
      signatureUrl,
    });

    return { error: result.error, signatureUrl };
  };

  const handleSaveDraft = async () => {
    setLoading(true);
    setMessage(null);
    const result = await persistDraft();
    setLoading(false);
    setMessage(result.error ?? "Draft saved.");
    if (!result.error) {
      setSignatureDataUrl(null);
      onUpdated();
    }
  };

  const handleSubmit = async () => {
    if (!signatureDataUrl && !signoff?.signature_url) {
      setMessage("Add your signature before submitting this step.");
      return;
    }

    setLoading(true);
    setMessage(null);

    const draft = await persistDraft();
    if (draft.error) {
      setLoading(false);
      setMessage(draft.error);
      return;
    }

    if (!draft.signatureUrl) {
      setLoading(false);
      setMessage("A signature is required before submitting this step.");
      return;
    }

    const refreshed = await upsertItcSignoffDraft({
      itcId,
      stepKey: step.step_key,
      stepIndex: step.step_index,
      authorId: workerId,
      authorName: workerName,
      comments,
      fieldData,
      signatureUrl: draft.signatureUrl,
    });

    if (refreshed.error || !refreshed.signoff) {
      setLoading(false);
      setMessage(refreshed.error ?? "Save draft before submitting.");
      return;
    }

    const result = await submitItcSignoff({
      signoffId: refreshed.signoff.id,
      itcId,
      signedByWorkerId: workerId,
    });

    setLoading(false);
    setMessage(result.error ?? "Step submitted and locked.");
    if (!result.error) {
      setSignatureDataUrl(null);
      onUpdated();
    }
  };

  const signedAt = signoff?.signed_at ?? signoff?.submitted_at;

  return (
    <section
      id={`itc-step-${step.step_key}`}
      className={cn(
        cardClass,
        "overflow-hidden",
        isSubmitted && "ring-2 ring-emerald-200"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Step {stepNumber}
          </p>
          <h4 className="text-lg font-semibold text-slate-900">{step.title}</h4>
          {step.description ? (
            <p className="mt-1 text-sm text-slate-500">{step.description}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {isSubmitted ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Completed
            </span>
          ) : !isUnlocked ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              <Lock className="h-3.5 w-3.5" />
              Locked
            </span>
          ) : (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
              Ready
            </span>
          )}
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">
            Sign-off requirement
          </p>
          <p className="mt-1 text-sm text-orange-950">{step.compliance_text}</p>
        </div>

        {!isUnlocked && !isSubmitted ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Complete and submit the previous step to unlock fields and signature for this step.
          </p>
        ) : (
          <>
            {renderConditionalFields()}

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Comments
              </span>
              <textarea
                value={comments}
                disabled={isLocked}
                onChange={(e) => setComments(e.target.value)}
                rows={3}
                className={inputClass}
              />
            </label>

            {!isSubmitted ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-slate-500">
                  Individual step signature
                </p>
                <p className="mb-2 text-xs text-slate-500">
                  Sign below to confirm this step only. Each step requires its own signature.
                </p>
                {!isLocked ? (
                  <SignatureCanvas onChange={setSignatureDataUrl} />
                ) : (
                  <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500">
                    Signature canvas unlocks when this step becomes active.
                  </p>
                )}
                {signoff?.signature_url && !signatureDataUrl ? (
                  <p className="mt-2 text-xs text-slate-500">
                    A saved signature is on file for this draft. Sign again to replace it before
                    submitting.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2 rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
                <p className="font-semibold">Step signed and locked</p>
                {signedAt ? (
                  <p>Signed at: {new Date(signedAt).toLocaleString()}</p>
                ) : null}
                {signoff?.signed_by_worker_id || signoff?.author_id ? (
                  <p>
                    Signed by worker: {signoff?.signed_by_worker_id ?? signoff?.author_id}
                  </p>
                ) : null}
                {signoff?.signature_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={signoff.signature_url}
                    alt={`Signature for ${step.title}`}
                    className="mt-2 max-h-24 rounded border border-emerald-200 bg-white p-2"
                  />
                ) : null}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {!isSubmitted && isUnlocked ? (
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
                    className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Submit & Lock Step
                  </button>
                </>
              ) : isSubmitted ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={onChangeRequest}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  Request Change
                </button>
              ) : null}
            </div>

            {message ? <p className="text-sm text-slate-600">{message}</p> : null}
          </>
        )}
      </div>
    </section>
  );
}
