"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import FormBrandingHeader from "@/components/ui/FormBrandingHeader";
import SignaturePad from "@/components/forms/SignaturePad";
import {
  packHighFidelityAnswers,
  type HighFidelityFormKey,
} from "@/lib/high-fidelity-forms";
import type { CustomFormAnswers, CustomFormTemplate } from "@/lib/custom-forms";
import { uploadSignatureDataUrl } from "@/lib/custom-form-upload";
import { cn } from "@/lib/utils";
import {
  inputClass,
  labelClass,
  modalBodyClass,
  modalCloseIconButtonClass,
  modalOverlayClass,
  modalShellClass,
  modalStickyFooterClass,
} from "@/lib/ui-classes";

const LIKELIHOOD = [
  "Rare",
  "Unlikely",
  "Possible",
  "Likely",
  "Almost Certain",
] as const;

const CONSEQUENCE = [
  "Insignificant",
  "Minor",
  "Moderate",
  "Major",
  "Catastrophic",
] as const;

/** 1-based likelihood index × consequence index → risk band */
function riskBand(likelihoodIdx: number, consequenceIdx: number): "LOW" | "MED" | "HIGH" | "EXT" {
  const score = (likelihoodIdx + 1) * (consequenceIdx + 1);
  if (score >= 16) return "EXT";
  if (score >= 10) return "HIGH";
  if (score >= 5) return "MED";
  return "LOW";
}

function riskCellClass(band: "LOW" | "MED" | "HIGH" | "EXT"): string {
  if (band === "EXT") return "bg-red-700 text-white";
  if (band === "HIGH") return "bg-red-500 text-white";
  if (band === "MED") return "bg-amber-300 text-amber-950";
  return "bg-emerald-400 text-emerald-950";
}

const HAZARD_SECTIONS = [
  "1. Working at Heights",
  "2. Plant & Equipment",
  "3. Electrical",
  "4. Hazardous Substances / Chemicals",
  "5. Manual Handling",
  "6. Excavation / Trenching",
  "7. Traffic / Vehicles / Mobile Plant",
  "8. Noise / Vibration / Dust",
  "9. Environmental / Weather",
  "10. Other / Site Specific",
] as const;

const PPE_ITEMS = [
  "Hard hat",
  "Safety glasses",
  "Hearing protection",
  "Hi-vis vest / clothing",
  "Steel-cap boots",
  "Gloves",
  "Respiratory protection",
  "Fall arrest / harness",
  "Face shield",
  "Long sleeves / trousers",
  "Sunscreen",
  "Other PPE",
] as const;

type HazardRating = "" | "H" | "M" | "L";

type HazardRow = {
  applicable: boolean;
  rating: HazardRating;
  controls: string;
};

interface RiskAssessmentFormProps {
  open: boolean;
  template: CustomFormTemplate;
  workerName: string;
  projectLabel?: string | null;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (payload: {
    answers: CustomFormAnswers;
    signatureUrl: string | null;
  }) => Promise<void> | void;
}

export default function RiskAssessmentForm({
  open,
  template,
  workerName,
  projectLabel,
  saving = false,
  error = null,
  onClose,
  onSubmit,
}: RiskAssessmentFormProps) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [workDate, setWorkDate] = useState(today);
  const [location, setLocation] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [selectedLikelihood, setSelectedLikelihood] = useState(2);
  const [selectedConsequence, setSelectedConsequence] = useState(2);
  const [hazards, setHazards] = useState<HazardRow[]>(
    () => HAZARD_SECTIONS.map(() => ({ applicable: false, rating: "", controls: "" }))
  );
  const [ppe, setPpe] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PPE_ITEMS.map((item) => [item, false]))
  );
  const [additionalControls, setAdditionalControls] = useState("");
  const [assessorSignature, setAssessorSignature] = useState<string | null>(null);
  const [siteManagerSignature, setSiteManagerSignature] = useState<string | null>(
    null
  );
  const [buildersRepSignature, setBuildersRepSignature] = useState<string | null>(
    null
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const residualBand = riskBand(selectedLikelihood, selectedConsequence);

  const updateHazard = (index: number, patch: Partial<HazardRow>) => {
    setHazards((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  };

  const handleSubmit = async () => {
    setLocalError(null);
    if (!taskDescription.trim()) {
      setLocalError("Describe the task / activity before submitting.");
      return;
    }
    if (!assessorSignature?.trim()) {
      setLocalError("Assessor signature is required.");
      return;
    }

    setSubmitting(true);
    try {
      const uploaded = await uploadSignatureDataUrl(
        assessorSignature,
        `custom-forms/risk-assessment/${Date.now()}`
      );
      if (uploaded.error && !uploaded.url) {
        throw new Error(uploaded.error);
      }

      const hazardSummary = HAZARD_SECTIONS.map((title, index) => {
        const row = hazards[index]!;
        if (!row.applicable) return null;
        return `${title}: ${row.rating || "—"} — ${row.controls.trim() || "No controls noted"}`;
      }).filter(Boolean);

      const selectedPpe = PPE_ITEMS.filter((item) => ppe[item]);

      const signatures = {
        assessor: assessorSignature,
        siteManager: siteManagerSignature,
        buildersRep: buildersRepSignature,
      };

      const payload = {
        formKey: "risk_assessment" as HighFidelityFormKey,
        workDate,
        location: location.trim(),
        taskDescription: taskDescription.trim(),
        residualRisk: {
          likelihood: LIKELIHOOD[selectedLikelihood],
          consequence: CONSEQUENCE[selectedConsequence],
          band: residualBand,
        },
        hazards: HAZARD_SECTIONS.map((title, index) => ({
          title,
          ...hazards[index]!,
        })),
        ppe: selectedPpe,
        additionalControls: additionalControls.trim(),
        preparedBy: workerName,
        signatures,
      };

      const answers = packHighFidelityAnswers({
        summaryLines: [
          { id: "work_date", label: "Date", value: workDate },
          { id: "location", label: "Location", value: location },
          { id: "task", label: "Task / Activity", value: taskDescription },
          {
            id: "residual_risk",
            label: "Residual Risk",
            value: `${residualBand} (${LIKELIHOOD[selectedLikelihood]} × ${CONSEQUENCE[selectedConsequence]})`,
          },
          {
            id: "hazards_summary",
            label: "Hazards Identified",
            value: hazardSummary.join(" | "),
          },
          {
            id: "ppe",
            label: "PPE Required",
            value: selectedPpe.join(", "),
          },
          {
            id: "additional_controls",
            label: "Additional Controls",
            value: additionalControls,
          },
          { id: "prepared_by", label: "Prepared By", value: workerName },
          {
            id: "signoff_complete",
            label: "Sign-off",
            value: [
              assessorSignature ? "Assessor signed" : null,
              siteManagerSignature ? "Site Manager signed" : null,
              buildersRepSignature ? "Builder's Rep signed" : null,
            ]
              .filter(Boolean)
              .join(", "),
          },
        ],
        payload,
      });

      answers.signature_assessor = {
        label: "Assessor Signature",
        type: "signature",
        value: { url: assessorSignature },
      };
      if (siteManagerSignature) {
        answers.signature_site_manager = {
          label: "Site Manager Signature",
          type: "signature",
          value: { url: siteManagerSignature },
        };
      }
      if (buildersRepSignature) {
        answers.signature_builders_rep = {
          label: "Builder's Rep Signature",
          type: "signature",
          value: { url: buildersRepSignature },
        };
      }

      await onSubmit({
        answers,
        signatureUrl: uploaded.url || assessorSignature,
      });
    } catch (cause) {
      setLocalError(
        cause instanceof Error ? cause.message : "Failed to submit Risk Assessment."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || typeof document === "undefined") return null;

  const busy = saving || submitting;

  return createPortal(
    <div className={modalOverlayClass}>
      <div className={cn(modalShellClass, "max-w-4xl")}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <FormBrandingHeader
            title={template.title}
            subtitle="Site risk assessment with 5×5 matrix"
            meta={projectLabel ? `Project · ${projectLabel}` : undefined}
            className="border-0 pb-0"
          />
          <button type="button" onClick={onClose} className={modalCloseIconButtonClass}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={modalBodyClass}>
          <div className="space-y-6">
            <section className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className={labelClass} htmlFor="ra-date">
                  Date
                </label>
                <input
                  id="ra-date"
                  type="date"
                  className={cn(inputClass, "mt-1")}
                  value={workDate}
                  onChange={(event) => setWorkDate(event.target.value)}
                  disabled={busy}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="ra-location">
                  Location / Area
                </label>
                <input
                  id="ra-location"
                  className={cn(inputClass, "mt-1")}
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="e.g. Level 2 plant room"
                  disabled={busy}
                />
              </div>
              <div>
                <label className={labelClass}>Prepared by</label>
                <p className="mt-2 text-sm font-semibold text-slate-900">{workerName}</p>
              </div>
              <div className="sm:col-span-3">
                <label className={labelClass} htmlFor="ra-task">
                  Task / Activity *
                </label>
                <textarea
                  id="ra-task"
                  className={cn(inputClass, "mt-1 min-h-[72px] resize-y")}
                  value={taskDescription}
                  onChange={(event) => setTaskDescription(event.target.value)}
                  placeholder="Describe the work being assessed"
                  disabled={busy}
                />
              </div>
            </section>

            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                  5×5 Risk Assessment Matrix
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Tap a cell to set residual likelihood × consequence. Current band:{" "}
                  <span className="font-semibold text-slate-800">{residualBand}</span>
                </p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full border-collapse text-center text-xs">
                  <thead>
                    <tr>
                      <th className="border border-slate-200 bg-slate-50 px-2 py-2 text-left font-semibold text-slate-600">
                        Likelihood ↓ / Consequence →
                      </th>
                      {CONSEQUENCE.map((label) => (
                        <th
                          key={label}
                          className="border border-slate-200 bg-slate-50 px-2 py-2 font-semibold text-slate-700"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {LIKELIHOOD.map((likelihood, li) => (
                      <tr key={likelihood}>
                        <th className="border border-slate-200 bg-slate-50 px-2 py-2 text-left font-semibold text-slate-700">
                          {likelihood}
                        </th>
                        {CONSEQUENCE.map((consequence, ci) => {
                          const band = riskBand(li, ci);
                          const selected =
                            selectedLikelihood === li && selectedConsequence === ci;
                          return (
                            <td key={`${likelihood}-${consequence}`} className="p-0">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  setSelectedLikelihood(li);
                                  setSelectedConsequence(ci);
                                }}
                                className={cn(
                                  "flex h-12 w-full min-w-[4.5rem] items-center justify-center border border-slate-200 text-[11px] font-bold",
                                  riskCellClass(band),
                                  selected && "ring-2 ring-inset ring-slate-900"
                                )}
                              >
                                {band}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-3 text-xs font-semibold">
                <span className="rounded bg-emerald-400 px-2 py-1 text-emerald-950">LOW</span>
                <span className="rounded bg-amber-300 px-2 py-1 text-amber-950">MED</span>
                <span className="rounded bg-red-500 px-2 py-1 text-white">HIGH</span>
                <span className="rounded bg-red-700 px-2 py-1 text-white">EXT</span>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                Hazard Identification (10 parts)
              </h3>
              <div className="space-y-3">
                {HAZARD_SECTIONS.map((title, index) => {
                  const row = hazards[index]!;
                  return (
                    <div
                      key={title}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                          <input
                            type="checkbox"
                            checked={row.applicable}
                            onChange={(event) =>
                              updateHazard(index, {
                                applicable: event.target.checked,
                                rating: event.target.checked ? row.rating || "M" : "",
                              })
                            }
                            disabled={busy}
                          />
                          {title}
                        </label>
                        <div className="flex gap-1">
                          {(["H", "M", "L"] as const).map((rating) => (
                            <button
                              key={rating}
                              type="button"
                              disabled={busy || !row.applicable}
                              onClick={() => updateHazard(index, { rating })}
                              className={cn(
                                "rounded px-2.5 py-1 text-xs font-bold ring-1 ring-inset disabled:opacity-40",
                                row.rating === rating
                                  ? rating === "H"
                                    ? "bg-red-500 text-white ring-red-600"
                                    : rating === "M"
                                      ? "bg-amber-300 text-amber-950 ring-amber-400"
                                      : "bg-emerald-400 text-emerald-950 ring-emerald-500"
                                  : "bg-white text-slate-600 ring-slate-200"
                              )}
                            >
                              {rating}
                            </button>
                          ))}
                        </div>
                      </div>
                      {row.applicable ? (
                        <input
                          className={cn(inputClass, "mt-2")}
                          value={row.controls}
                          onChange={(event) =>
                            updateHazard(index, { controls: event.target.value })
                          }
                          placeholder="Controls / mitigation"
                          disabled={busy}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                PPE Checklist
              </h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {PPE_ITEMS.map((item) => (
                  <label
                    key={item}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(ppe[item])}
                      onChange={(event) =>
                        setPpe((current) => ({
                          ...current,
                          [item]: event.target.checked,
                        }))
                      }
                      disabled={busy}
                    />
                    {item}
                  </label>
                ))}
              </div>
            </section>

            <section>
              <label className={labelClass} htmlFor="ra-controls">
                Additional controls / comments
              </label>
              <textarea
                id="ra-controls"
                className={cn(inputClass, "mt-1 min-h-[80px] resize-y")}
                value={additionalControls}
                onChange={(event) => setAdditionalControls(event.target.value)}
                disabled={busy}
              />
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                Sign Off
              </h3>
              <SignaturePad
                label="Assessor"
                required
                disabled={busy}
                value={assessorSignature}
                onChange={setAssessorSignature}
              />
              <SignaturePad
                label="Site Manager"
                disabled={busy}
                value={siteManagerSignature}
                onChange={setSiteManagerSignature}
              />
              <SignaturePad
                label="Builder's Rep"
                disabled={busy}
                value={buildersRepSignature}
                onChange={setBuildersRepSignature}
              />
            </section>

            {localError || error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {localError || error}
              </p>
            ) : null}
          </div>
        </div>

        <div className={modalStickyFooterClass}>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Submit Risk Assessment
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
