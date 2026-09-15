"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, Lock, MapPin } from "lucide-react";
import SignatureCanvas from "@/components/prestart/SignatureCanvas";
import {
  captureGps,
  insertSignoff,
  uploadFieldSignature,
  type FieldItcRecord,
  type FieldItcSignoff,
} from "@/lib/api/itc";
import type { ItcFormStepTemplate } from "@/lib/itc-templates";
import { cardClass, inputClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface FieldItcSignoffProps {
  projectId: string;
  itc: FieldItcRecord;
  step: ItcFormStepTemplate;
  signoffs: FieldItcSignoff[];
  workerId: string;
  workerName: string;
  roverOptions: string[];
  operatorOptions: string[];
  onSigned: () => void;
}

export default function FieldItcSignoffCard({
  projectId,
  itc,
  step,
  signoffs,
  workerId,
  workerName,
  roverOptions,
  operatorOptions,
  onSigned,
}: FieldItcSignoffProps) {
  const existing = useMemo(
    () =>
      signoffs.filter(
        (row) => row.step_index === step.step_index && row.author_id === workerId
      ),
    [signoffs, step.step_index, workerId]
  );
  const submitted = existing[0];
  const priorComplete = useMemo(() => {
    if (step.step_index <= 0) return true;
    return signoffs.some(
      (row) => row.step_index === step.step_index - 1 && row.author_id === workerId
    );
  }, [signoffs, step.step_index, workerId]);

  const [checked, setChecked] = useState(false);
  const [comments, setComments] = useState("");
  const [fieldData, setFieldData] = useState<Record<string, string>>({});
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [gpsLabel, setGpsLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const locked = Boolean(submitted) || !priorComplete;
  const specType = String(step.field_spec?.type ?? "checklist");

  const handleSubmit = async () => {
    setMessage(null);
    if (!checked) {
      setMessage("Confirm the compliance checkbox before signing.");
      return;
    }
    if (!signatureDataUrl) {
      setMessage("A signature is required.");
      return;
    }

    setLoading(true);
    try {
      const gps = await captureGps();
      if (gps.lat != null && gps.lng != null) {
        setGpsLabel(`${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}`);
      } else {
        setGpsLabel("GPS unavailable");
      }

      const uploaded = await uploadFieldSignature({
        projectId,
        itcId: itc.id,
        stepKey: step.step_key,
        dataUrl: signatureDataUrl,
      });
      if (!uploaded.url) {
        setMessage(uploaded.error ?? "Could not upload signature.");
        return;
      }

      const result = await insertSignoff({
        itcId: itc.id,
        step,
        authorId: workerId,
        authorName: workerName,
        comments,
        fieldData,
        signatureUrl: uploaded.url,
        gpsLat: gps.lat,
        gpsLng: gps.lng,
      });
      if (result.error) {
        setMessage(result.error);
        return;
      }
      onSigned();
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={`${cardClass} p-4`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
            Step {step.step_index + 1} of 17
          </p>
          <h3 className="text-base font-semibold text-slate-900">{step.title}</h3>
          {step.description ? (
            <p className="text-sm text-slate-500">{step.description}</p>
          ) : null}
        </div>
        {submitted ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Signed
          </span>
        ) : !priorComplete ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
            <Lock className="h-3.5 w-3.5" />
            Locked
          </span>
        ) : null}
      </div>

      {specType === "survey" ? (
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Rover
            </span>
            <select
              disabled={locked}
              value={fieldData.rover_id ?? ""}
              onChange={(event) =>
                setFieldData((current) => ({ ...current, rover_id: event.target.value }))
              }
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
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Surveyor / operator
            </span>
            {operatorOptions.length ? (
              <select
                disabled={locked}
                value={fieldData.operator_name ?? ""}
                onChange={(event) =>
                  setFieldData((current) => ({
                    ...current,
                    operator_name: event.target.value,
                  }))
                }
                className={inputClass}
              >
                <option value="">Select surveyor</option>
                {operatorOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                disabled={locked}
                value={fieldData.operator_name ?? ""}
                onChange={(event) =>
                  setFieldData((current) => ({
                    ...current,
                    operator_name: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="Surveyor name"
              />
            )}
          </label>
        </div>
      ) : null}

      {specType === "compaction" ? (
        <div className="mb-3 grid gap-3 sm:grid-cols-3">
          {["test_number", "company_name", "technician_name"].map((key) => (
            <label key={key} className="block">
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                {key.replace(/_/g, " ")}
              </span>
              <input
                disabled={locked}
                value={fieldData[key] ?? ""}
                onChange={(event) =>
                  setFieldData((current) => ({ ...current, [key]: event.target.value }))
                }
                className={inputClass}
              />
            </label>
          ))}
        </div>
      ) : null}

      {specType === "cctv" ? (
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Outcome
            </span>
            <select
              disabled={locked}
              value={fieldData.outcome ?? ""}
              onChange={(event) =>
                setFieldData((current) => ({ ...current, outcome: event.target.value }))
              }
              className={inputClass}
            >
              <option value="">Select</option>
              <option value="Pass">Pass</option>
              <option value="Fail">Fail</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Return required
            </span>
            <select
              disabled={locked}
              value={fieldData.return_required ?? ""}
              onChange={(event) =>
                setFieldData((current) => ({
                  ...current,
                  return_required: event.target.value,
                }))
              }
              className={inputClass}
            >
              <option value="">Select</option>
              <option value="Return Required">Return Required</option>
              <option value="Not Required">Not Required</option>
            </select>
          </label>
        </div>
      ) : null}

      {specType === "pressure_test" ? (
        <p className="mb-3 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-800">
          Complete the Pressure Test tool tab, then sign this step.
        </p>
      ) : null}

      <label className={cn("mb-3 flex items-start gap-2 text-sm text-slate-700", locked && "opacity-60")}>
        <input
          type="checkbox"
          disabled={locked}
          checked={submitted ? true : checked}
          onChange={(event) => setChecked(event.target.checked)}
          className="mt-0.5"
        />
        <span>{step.compliance_text}</span>
      </label>

      <label className="mb-3 block">
        <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
          Comments
        </span>
        <textarea
          disabled={locked}
          value={submitted?.comments ?? comments}
          onChange={(event) => setComments(event.target.value)}
          rows={3}
          className={inputClass}
        />
      </label>

      <div className="mb-3">
        <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Signature</p>
        {submitted?.signature_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={submitted.signature_url}
            alt="Submitted signature"
            className="h-24 rounded-lg border border-slate-200 bg-white object-contain"
          />
        ) : (
          <div className={cn(locked && "pointer-events-none opacity-50")}>
            <SignatureCanvas onChange={setSignatureDataUrl} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="inline-flex items-center gap-1 text-xs text-slate-500">
          <MapPin className="h-3.5 w-3.5" />
          {submitted?.gps_lat != null && submitted?.gps_lng != null
            ? `${submitted.gps_lat.toFixed(5)}, ${submitted.gps_lng.toFixed(5)}`
            : gpsLabel ?? "GPS captured on submit"}
        </p>
        <button
          type="button"
          disabled={locked || loading}
          onClick={() => void handleSubmit()}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitted ? "Signed" : "Submit sign-off"}
        </button>
      </div>
      {message ? <p className="mt-2 text-sm text-red-600">{message}</p> : null}
    </section>
  );
}
