"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import SignatureCanvas from "@/components/prestart/SignatureCanvas";
import FormBrandingHeader from "@/components/ui/FormBrandingHeader";
import {
  FLEET_PRESTART_TEMPLATE_NAME,
  submitFleetPrestart,
} from "@/lib/fleet-prestart";
import type { OrganizationFleetVehicle } from "@/lib/organization-fleet";
import { resolvePrestartOperatorIdentity } from "@/lib/prestart-operator";
import { uploadSignature } from "@/lib/prestart-upload";
import { cardClass, inputClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface FleetPrestartFormProps {
  vehicle: OrganizationFleetVehicle;
}

const STEPS = [
  "Working order",
  "Issues / defects",
  "Current KM's",
  "Sign & Submit",
] as const;

export default function FleetPrestartForm({ vehicle }: FleetPrestartFormProps) {
  const [step, setStep] = useState(1);
  const [operatorName, setOperatorName] = useState("");
  const [operatorLoading, setOperatorLoading] = useState(true);
  const [operatorLocked, setOperatorLocked] = useState(false);
  const [operatorWorkerId, setOperatorWorkerId] = useState<string | null>(null);
  const [operatorUserId, setOperatorUserId] = useState<string | null>(null);
  const [workingOrder, setWorkingOrder] = useState<"" | "Yes" | "No">("");
  const [workingOrderNotes, setWorkingOrderNotes] = useState("");
  const [defectsReported, setDefectsReported] = useState<"" | "Yes" | "No">("");
  const [defectDetails, setDefectDetails] = useState("");
  const [currentKms, setCurrentKms] = useState(
    vehicle.current_kms != null ? String(vehicle.current_kms) : ""
  );
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void resolvePrestartOperatorIdentity().then((identity) => {
      if (cancelled) return;
      setOperatorLocked(identity.hasSession && Boolean(identity.operatorName));
      setOperatorWorkerId(identity.workerId);
      setOperatorUserId(identity.userId);
      if (identity.operatorName) setOperatorName(identity.operatorName);
      setOperatorLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const assignmentLabel = vehicle.assigned_project_name
    ? `Project · ${vehicle.assigned_project_name}`
    : vehicle.state
      ? `State · ${vehicle.state}`
      : "Unassigned";

  const validateStep = (current: number): string | null => {
    if (!operatorName.trim()) return "Operator name is required.";
    if (current === 1) {
      if (!workingOrder) return "Select whether the fleet is in good working order.";
      if (workingOrder === "No" && !workingOrderNotes.trim()) {
        return "Explain why the fleet is not in good working order.";
      }
    }
    if (current === 2) {
      if (!defectsReported) return "Select whether there are issues or defects to report.";
      if (defectsReported === "Yes" && !defectDetails.trim()) {
        return "Enter details of the issues or defects.";
      }
    }
    if (current === 3) {
      const kms = Number(currentKms);
      if (!currentKms.trim() || !Number.isFinite(kms) || kms < 0) {
        return "Enter the current kilometres.";
      }
    }
    if (current === 4 && !signatureDataUrl) {
      return "Please sign off before submitting.";
    }
    return null;
  };

  const goNext = () => {
    const message = validateStep(step);
    if (message) {
      setError(message);
      return;
    }
    setError(null);
    setStep((current) => Math.min(4, current + 1));
  };

  const handleSubmit = async () => {
    const message = validateStep(4);
    if (message) {
      setError(message);
      return;
    }
    if (workingOrder !== "Yes" && workingOrder !== "No") return;
    if (defectsReported !== "Yes" && defectsReported !== "No") return;

    setSubmitting(true);
    setError(null);
    try {
      const signatureUrl = signatureDataUrl
        ? await uploadSignature(
            signatureDataUrl,
            `${vehicle.id}/signature-${Date.now()}.png`
          )
        : null;
      const result = await submitFleetPrestart({
        fleet: vehicle,
        operatorName: operatorName.trim(),
        operatorWorkerId,
        userId: operatorUserId,
        workingOrder,
        workingOrderNotes,
        defectsReported,
        defectDetails,
        currentKms: Number(currentKms),
        signatureUrl,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    const hasDefect = workingOrder === "No" || defectsReported === "Yes";
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <CheckCircle2 className="mb-4 h-16 w-16 text-emerald-500" />
        <h2 className="text-2xl font-bold text-slate-900">Pre-Start Submitted</h2>
        <p className="mt-2 max-w-sm text-slate-600">
          {hasDefect
            ? "Issue reported — this fleet pre-start has been sent to the dashboard register."
            : "Fleet cleared for use today."}
        </p>
        <p className="mt-4 text-sm text-slate-500">
          {vehicle.unit_number} · {FLEET_PRESTART_TEMPLATE_NAME}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 pb-10">
      <div className={cn("p-4", cardClass)}>
        <FormBrandingHeader
          title={FLEET_PRESTART_TEMPLATE_NAME}
          subtitle={vehicle.unit_number}
          meta={assignmentLabel}
        />
        <p className="mt-3 text-xs font-bold uppercase tracking-widest text-orange-500">
          {FLEET_PRESTART_TEMPLATE_NAME}
        </p>
        <h1 className="mt-1 text-xl font-bold text-slate-900">{vehicle.unit_number}</h1>
        <p className="text-sm text-slate-600">
          {[vehicle.make, vehicle.model, vehicle.registration].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-1 text-xs text-slate-500">{assignmentLabel}</p>
      </div>

      <ol className="flex flex-wrap gap-2 text-xs font-semibold">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={cn(
              "rounded-full px-3 py-1.5",
              step === index + 1
                ? "bg-orange-500 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200"
            )}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Operator name</span>
        <input
          className={inputClass}
          value={operatorName}
          onChange={(event) => setOperatorName(event.target.value)}
          disabled={operatorLoading || operatorLocked}
          required
        />
      </label>

      {step === 1 ? (
        <section className={cn("space-y-3 p-4", cardClass)}>
          <h2 className="text-sm font-semibold text-slate-900">
            1. Is the fleet in good working order?
          </h2>
          <div className="flex gap-3">
            {(["Yes", "No"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setWorkingOrder(option)}
                className={cn(
                  "flex-1 rounded-lg border px-4 py-3 text-sm font-semibold",
                  workingOrder === option
                    ? option === "Yes"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                      : "border-red-500 bg-red-50 text-red-800"
                    : "border-slate-200 bg-white text-slate-700"
                )}
              >
                {option}
              </button>
            ))}
          </div>
          {workingOrder === "No" ? (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Explanation (required)
              </span>
              <textarea
                className={inputClass}
                rows={3}
                value={workingOrderNotes}
                onChange={(event) => setWorkingOrderNotes(event.target.value)}
                required
              />
            </label>
          ) : null}
        </section>
      ) : null}

      {step === 2 ? (
        <section className={cn("space-y-3 p-4", cardClass)}>
          <h2 className="text-sm font-semibold text-slate-900">
            2. Are there any issues or defects you would like to report?
          </h2>
          <div className="flex gap-3">
            {(["Yes", "No"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDefectsReported(option)}
                className={cn(
                  "flex-1 rounded-lg border px-4 py-3 text-sm font-semibold",
                  defectsReported === option
                    ? option === "Yes"
                      ? "border-red-500 bg-red-50 text-red-800"
                      : "border-emerald-500 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-white text-slate-700"
                )}
              >
                {option}
              </button>
            ))}
          </div>
          {defectsReported === "Yes" ? (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Defect details (required)
              </span>
              <textarea
                className={inputClass}
                rows={3}
                value={defectDetails}
                onChange={(event) => setDefectDetails(event.target.value)}
                required
              />
            </label>
          ) : null}
        </section>
      ) : null}

      {step === 3 ? (
        <section className={cn("space-y-3 p-4", cardClass)}>
          <h2 className="text-sm font-semibold text-slate-900">3. Current KM&apos;s</h2>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            className={inputClass}
            value={currentKms}
            onChange={(event) => setCurrentKms(event.target.value)}
            placeholder="e.g. 12450"
            required
          />
        </section>
      ) : null}

      {step === 4 ? (
        <section className={cn("space-y-3 p-4", cardClass)}>
          <h2 className="text-sm font-semibold text-slate-900">4. Sign &amp; Submit</h2>
          <SignatureCanvas onChange={setSignatureDataUrl} value={signatureDataUrl} />
        </section>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="flex justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setStep((current) => Math.max(1, current - 1));
          }}
          disabled={step === 1}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
        >
          Back
        </button>
        {step < 4 ? (
          <button
            type="button"
            onClick={goNext}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Submit Fleet Pre-Start
          </button>
        )}
      </div>
    </div>
  );
}
