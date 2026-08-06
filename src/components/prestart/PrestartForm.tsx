"use client";

import { useState, useEffect } from "react";
import { Loader2, CheckCircle2, AlertTriangle, Camera } from "lucide-react";
import type { PlantAsset } from "@/lib/supabase";
import {
  submitPlantPrestart,
} from "@/lib/supabase";
import { uploadDefectPhoto, uploadSignature } from "@/lib/prestart-upload";
import {
  PRESTART_TEMPLATES,
  PRESTART_TEMPLATE_LABELS,
  detectDefectsInCheckData,
  type PrestartTemplate,
  type PrestartField,
} from "@/lib/prestart-templates";
import SignatureCanvas from "./SignatureCanvas";
import { cn } from "@/lib/utils";
import { cardClass, inputClass } from "@/lib/ui-classes";
import FormBrandingHeader from "@/components/ui/FormBrandingHeader";

interface PrestartFormProps {
  plant: PlantAsset;
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: PrestartField;
  value: string;
  onChange: (val: string) => void;
}) {
  if (field.type === "section") {
    return (
      <h3 className="col-span-full mt-4 border-b border-slate-200 pb-2 text-sm font-bold uppercase tracking-wider text-orange-500">
        {field.label}
      </h3>
    );
  }

  if (field.type === "select" && field.options) {
    return (
      <label className="block space-y-1.5">
        <span className="text-sm text-slate-600">
          {field.label}
          {field.required && <span className="text-orange-500"> *</span>}
        </span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          className={inputClass}
        >
          <option value="">Select…</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "number") {
    return (
      <label className="block space-y-1.5">
        <span className="text-sm text-slate-600">
          {field.label}
          {field.required && <span className="text-orange-500"> *</span>}
          {field.unit && (
            <span className="text-slate-500"> ({field.unit})</span>
          )}
        </span>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          placeholder={field.placeholder}
          className={inputClass}
        />
      </label>
    );
  }

  return (
    <label className="block space-y-1.5">
      <span className="text-sm text-slate-600">{field.label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </label>
  );
}

export default function PrestartForm({ plant }: PrestartFormProps) {
  const template = (plant.prestart_template ?? "excavator") as PrestartTemplate;
  const fields = PRESTART_TEMPLATES[template];

  const [operatorName, setOperatorName] = useState("");
  const [checkData, setCheckData] = useState<Record<string, string>>({});
  const [defectComments, setDefectComments] = useState("");
  const [hasDefectManual, setHasDefectManual] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initial: Record<string, string> = {};
    const readingKey = template === "truck" ? "current_kms" : "hours";
    const serviceKey = template === "truck" ? "next_service_kms" : "next_service";

    if (plant.current_hours != null && readingKey === "hours") {
      initial.hours = String(plant.current_hours);
    }
    if (plant.current_kms != null && readingKey === "current_kms") {
      initial.current_kms = String(plant.current_kms);
    }
    if (initial[readingKey] === undefined && plant.current_hours != null) {
      initial[readingKey] = String(
        template === "truck" ? plant.current_kms ?? "" : plant.current_hours
      );
    }
    void serviceKey;
    setCheckData(initial);
  }, [plant, template]);

  const autoDefect = detectDefectsInCheckData(checkData);
  const hasDefect = hasDefectManual || autoDefect || defectComments.length > 0;

  const updateField = (key: string, value: string) => {
    setCheckData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signatureDataUrl) {
      setError("Please sign off before submitting.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const timestamp = Date.now();
      let defectPhotoUrl: string | undefined;

      if (photoFile) {
        const url = await uploadDefectPhoto(
          photoFile,
          `${plant.id}/defect-${timestamp}`
        );
        defectPhotoUrl = url ?? undefined;
      }

      const signatureUrl =
        (await uploadSignature(
          signatureDataUrl,
          `${plant.id}/signature-${timestamp}.png`
        )) ?? undefined;

      const { error: submitErr } = await submitPlantPrestart({
        plantId: plant.id,
        operatorName,
        projectId: plant.assigned_project_id,
        checkData,
        template,
        hasDefect,
        defectComments: defectComments || undefined,
        defectPhotoUrl,
        signatureUrl,
      });

      if (submitErr) {
        setError(submitErr);
        return;
      }
      setSubmitted(true);
    } catch (err) {
      console.error("Pre-start submission failed:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Submission failed. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <CheckCircle2 className="mb-4 h-16 w-16 text-emerald-500" />
        <h2 className="text-2xl font-bold text-slate-900">Pre-Start Submitted</h2>
        <p className="mt-2 max-w-sm text-slate-600">
          {hasDefect
            ? "Defect reported — machine marked out of service."
            : "Machine cleared for use today."}
        </p>
        <p className="mt-4 text-sm text-slate-500">
          {plant.unit_number} · {PRESTART_TEMPLATE_LABELS[template]}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-lg space-y-6 px-4 pb-10">
      {/* Machine header */}
      <div className={cn("p-4", cardClass)}>
        <FormBrandingHeader
          className="mb-4 border-b border-slate-200 pb-4"
          title="Plant Pre-Start"
          subtitle={plant.unit_number}
          meta={[plant.make, plant.model, plant.category, PRESTART_TEMPLATE_LABELS[template]]
            .filter(Boolean)
            .join(" · ")}
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-100 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {autoDefect && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-100 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          One or more checks marked &quot;Defect&quot; — machine will be flagged.
        </div>
      )}

      <label className="block space-y-1.5">
        <span className="text-sm text-slate-600">
          Operator Name <span className="text-orange-500">*</span>
        </span>
        <input
          type="text"
          value={operatorName}
          onChange={(e) => setOperatorName(e.target.value)}
          required
          placeholder="Your full name"
          className={inputClass}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) =>
          field.type === "section" ? (
            <FieldInput
              key={field.key}
              field={field}
              value=""
              onChange={() => {}}
            />
          ) : (
            <FieldInput
              key={field.key}
              field={field}
              value={checkData[field.key] ?? ""}
              onChange={(v) => updateField(field.key, v)}
            />
          )
        )}
      </div>

      {/* Defect section */}
      <div className={cn("space-y-4 p-4", cardClass)}>
        <h3 className="font-semibold text-slate-900">Defects &amp; Comments</h3>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={hasDefectManual}
            onChange={(e) => setHasDefectManual(e.target.checked)}
            className="h-4 w-4 rounded accent-orange-500"
          />
          <span className="text-sm text-slate-600">Report a defect / hazard</span>
        </label>

        <textarea
          value={defectComments}
          onChange={(e) => setDefectComments(e.target.value)}
          placeholder="Describe any defects, damage, or concerns…"
          rows={3}
          className={cn(inputClass, "placeholder:text-slate-400")}
        />

        <label className="block">
          <span className="mb-2 flex items-center gap-2 text-sm text-slate-600">
            <Camera className="h-4 w-4" /> Defect Photo (optional)
          </span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-slate-600 file:mr-3 file:rounded file:border-0 file:bg-orange-600 file:px-3 file:py-2 file:text-white"
          />
        </label>
      </div>

      {/* Signature */}
      <div className="space-y-2">
        <h3 className="font-semibold text-slate-900">
          Operator Sign-Off <span className="text-orange-500">*</span>
        </h3>
        <SignatureCanvas onChange={setSignatureDataUrl} />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-xl py-4 text-lg font-bold transition",
          hasDefect
            ? "bg-red-600 hover:bg-red-500"
            : "bg-orange-600 hover:bg-orange-500",
          submitting && "opacity-60"
        )}
      >
        {submitting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" /> Submitting…
          </>
        ) : hasDefect ? (
          "Submit — Report Defect"
        ) : (
          "Submit Pre-Start"
        )}
      </button>
    </form>
  );
}
