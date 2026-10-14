"use client";

import { useCallback, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import Link from "next/link";
import { CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { submitBulkOnboarding } from "@/app/actions/bulk-onboard-workers";
import {
  BULK_ONBOARDING_CSV_HEADERS,
  BULK_ONBOARDING_FIELD_LABELS,
  getInvalidBulkOnboardingFields,
  normalizeBulkOnboardingWorker,
  parseBulkOnboardingCsv,
  isDateField,
  validateBulkOnboardingField,
  workerDisplayName,
  type BulkOnboardingFieldKey,
  type BulkOnboardingWorker,
} from "@/lib/bulk-onboarding";
import { WORKER_STATE_REGION_OPTIONS } from "@/lib/worker-state-region";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

type WizardPhase = "upload" | "fix" | "summary" | "done";

export default function BulkOnboardingImporter() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<WizardPhase>("upload");
  const [fileName, setFileName] = useState("");
  const [workers, setWorkers] = useState<BulkOnboardingWorker[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [draft, setDraft] = useState<Partial<Record<BulkOnboardingFieldKey, string>>>({});
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<BulkOnboardingFieldKey, string>>>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    invited: number;
    inviteErrors: string[];
  } | null>(null);

  const currentWorker = workers[currentIndex] ?? null;
  const missingFields = useMemo(
    () => (currentWorker ? getInvalidBulkOnboardingFields(currentWorker) : []),
    [currentWorker]
  );

  const applyFile = useCallback((file: File) => {
    setParseError(null);
    setSubmitError(null);
    setResult(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const parsed = parseBulkOnboardingCsv(text);
      if (parsed.error) {
        setWorkers([]);
        setParseError(parsed.error);
        setPhase("upload");
        return;
      }

      setWorkers(parsed.workers);
      setCurrentIndex(0);
      setDraft({});
      setFieldErrors({});
      setPhase("fix");
    };
    reader.onerror = () => {
      setParseError("Unable to read that file.");
    };
    reader.readAsText(file);
  }, []);

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) applyFile(file);
  };

  const updateDraft = (key: BulkOnboardingFieldKey, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const handleNext = (event: FormEvent) => {
    event.preventDefault();
    if (!currentWorker) return;

    const nextErrors: Partial<Record<BulkOnboardingFieldKey, string>> = {};
    const merged: BulkOnboardingWorker = { ...currentWorker };

    for (const key of missingFields) {
      const value = (draft[key] ?? currentWorker[key] ?? "").toString();
      const error = validateBulkOnboardingField(key, value);
      if (error) {
        nextErrors[key] = error;
        continue;
      }
      merged[key] = value;
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    const normalized = normalizeBulkOnboardingWorker(merged);
    const remaining = getInvalidBulkOnboardingFields(normalized);
    if (remaining.length > 0) {
      setWorkers((current) =>
        current.map((worker, index) => (index === currentIndex ? normalized : worker))
      );
      setDraft({});
      setFieldErrors(
        Object.fromEntries(
          remaining.map((key) => [
            key,
            validateBulkOnboardingField(key, normalized[key]) ?? "This field is required.",
          ])
        )
      );
      return;
    }

    setWorkers((current) =>
      current.map((worker, index) => (index === currentIndex ? normalized : worker))
    );
    setDraft({});
    setFieldErrors({});

    if (currentIndex + 1 >= workers.length) {
      setPhase("summary");
      return;
    }

    setCurrentIndex((index) => index + 1);
  };

  const handleSubmitAll = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await submitBulkOnboarding(workers);
      if (response.error) {
        setSubmitError(response.error);
        return;
      }
      setResult({
        imported: response.imported,
        invited: response.invited,
        inviteErrors: response.inviteErrors,
      });
      setPhase("done");
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : "Bulk onboarding failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const resetImporter = () => {
    setPhase("upload");
    setWorkers([]);
    setCurrentIndex(0);
    setDraft({});
    setFieldErrors({});
    setParseError(null);
    setSubmitError(null);
    setResult(null);
    setFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-orange-500">Bulk CSV Onboarding</h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload personal and financial details only. Compliance tickets are collected in the
          Fix-It wizard, then every worker is created and invited together.
        </p>
      </div>

      {phase === "upload" ? (
        <section className={cn(cardClass, "p-6")}>
          <label
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition",
              dragging
                ? "border-orange-500 bg-orange-50"
                : "border-slate-300 bg-slate-50 hover:border-orange-400 hover:bg-orange-50/60"
            )}
          >
            <Upload className="mb-3 h-8 w-8 text-orange-500" />
            <p className="text-sm font-semibold text-slate-800">
              Drag and drop a CSV here, or click to browse
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Include first name and last name columns (any spacing or capitalization).
              Missing columns are filled in the wizard. Supported headers:{" "}
              {BULK_ONBOARDING_CSV_HEADERS.join(", ")}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) applyFile(file);
              }}
            />
          </label>
          {fileName ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-slate-600">
              <FileSpreadsheet className="h-4 w-4 text-orange-500" />
              {fileName}
            </p>
          ) : null}
          {parseError ? (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {parseError}
            </p>
          ) : null}
        </section>
      ) : null}

      {phase === "fix" && currentWorker ? (
        <form onSubmit={handleNext} className={cn(cardClass, "space-y-5 p-6")}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-500">
                Worker {currentIndex + 1} of {workers.length}
              </p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900">
                {workerDisplayName(currentWorker)}
              </h2>
              {currentWorker.email ? (
                <p className="text-sm text-slate-500">{currentWorker.email}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={resetImporter}
              className="text-sm font-semibold text-slate-500 hover:text-slate-800"
            >
              Start over
            </button>
          </div>

          {missingFields.length === 0 ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              All required fields for this worker are complete.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {missingFields.map((key) => {
                const value = draft[key] ?? currentWorker[key] ?? "";
                const error = fieldErrors[key];
                return (
                  <label key={key} className="space-y-1">
                    <span className={labelClass}>{BULK_ONBOARDING_FIELD_LABELS[key]}</span>
                    {key === "state" ? (
                      <select
                        className={inputClass}
                        value={value}
                        onChange={(event) => updateDraft(key, event.target.value)}
                      >
                        <option value="">Select state</option>
                        {WORKER_STATE_REGION_OPTIONS.map((state) => (
                          <option key={state} value={state}>
                            {state}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className={inputClass}
                        type={isDateField(key) ? "date" : "text"}
                        value={value}
                        onChange={(event) => updateDraft(key, event.target.value)}
                        autoComplete="off"
                      />
                    )}
                    {error ? <p className="text-xs text-red-600">{error}</p> : null}
                  </label>
                );
              })}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-500"
            >
              {currentIndex + 1 >= workers.length ? "Review import" : "Next"}
            </button>
          </div>
        </form>
      ) : null}

      {phase === "summary" ? (
        <section className={cn(cardClass, "space-y-5 p-6")}>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Ready to onboard</h2>
            <p className="text-sm text-slate-500">
              {workers.length} worker{workers.length === 1 ? "" : "s"} will be created, then Set
              Password invites will be sent together.
            </p>
          </div>
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
            {workers.map((worker) => (
              <li key={`${worker.rowIndex}-${worker.email}`} className="px-4 py-3">
                <p className="font-semibold text-slate-900">{workerDisplayName(worker)}</p>
                <p className="text-sm text-slate-500">{worker.email}</p>
              </li>
            ))}
          </ul>
          {submitError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {submitError}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={resetImporter}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Start over
            </button>
            <button
              type="button"
              onClick={() => void handleSubmitAll()}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Submit all for onboarding
            </button>
          </div>
        </section>
      ) : null}

      {phase === "done" && result ? (
        <section className={cn(cardClass, "space-y-5 p-6")}>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 text-emerald-600" />
            <div>
              <h2 className="text-xl font-bold text-slate-900">Onboarding submitted</h2>
              <p className="text-sm text-slate-500">
                Created {result.imported} worker{result.imported === 1 ? "" : "s"} and sent{" "}
                {result.invited} Set Password invite{result.invited === 1 ? "" : "s"}.
              </p>
            </div>
          </div>
          {result.inviteErrors.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <p className="font-semibold">Some invites could not be sent</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {result.inviteErrors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Link
              href="/organisation/workers"
              className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500"
            >
              Open worker directory
            </Link>
            <button
              type="button"
              onClick={resetImporter}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Import another CSV
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
