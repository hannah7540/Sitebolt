"use client";

import { useCallback, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import Link from "next/link";
import { CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { submitBulkOnboarding } from "@/app/actions/bulk-onboard-workers";
import {
  BULK_ONBOARDING_CSV_HEADERS,
  BULK_ONBOARDING_FIELD_LABELS,
  BULK_TICKET_FIELD_KEYS,
  buildWizardDraft,
  bulkUploadPrefix,
  getFilledBulkOnboardingFields,
  getInvalidBulkOnboardingFields,
  normalizeBulkOnboardingWorker,
  parseBulkOnboardingCsv,
  isDateField,
  serializeBulkOnboardingVocs,
  validateBulkOnboardingField,
  workerDisplayName,
  type BulkOnboardingFieldKey,
  type BulkOnboardingVoc,
  type BulkOnboardingWorker,
} from "@/lib/bulk-onboarding";
import { WORKER_STATE_REGION_OPTIONS } from "@/lib/worker-state-region";
import { cardClass, inputClass, labelClass, sectionClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";
import DocumentCapture from "@/components/ui/DocumentCapture";
import VocListEditor from "@/components/workers/VocListEditor";
import {
  validateVocDrafts,
  type VocDraft,
} from "@/lib/voc-utils";

type WizardPhase = "upload" | "fix" | "summary" | "done";

function vocsToDrafts(vocs: BulkOnboardingVoc[]): VocDraft[] {
  return vocs.map((voc) => ({
    clientId: voc.clientId,
    voc_type: voc.voc_type,
    title: voc.title,
    issuing_org: voc.issuing_org,
    issue_date: voc.issue_date,
    expiry_date: voc.expiry_date,
    document_url: voc.document_url,
    file: null,
  }));
}

function vocsFromDrafts(drafts: VocDraft[]): BulkOnboardingVoc[] {
  return drafts.map((draft) => ({
    clientId: draft.clientId,
    title: draft.title || draft.voc_type,
    voc_type: draft.voc_type || draft.title,
    issuing_org: draft.issuing_org,
    issue_date: draft.issue_date,
    expiry_date: draft.expiry_date,
    document_url: draft.document_url,
  }));
}

export default function BulkOnboardingImporter() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<WizardPhase>("upload");
  const [fileName, setFileName] = useState("");
  const [workers, setWorkers] = useState<BulkOnboardingWorker[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [draft, setDraft] = useState<Partial<Record<BulkOnboardingFieldKey, string>>>({});
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<BulkOnboardingFieldKey, string>>>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [vocError, setVocError] = useState<string | null>(null);
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
  const filledFields = useMemo(
    () => (currentWorker ? getFilledBulkOnboardingFields(currentWorker) : []),
    [currentWorker]
  );
  const otherMissingFields = useMemo(
    () => missingFields.filter((key) => !BULK_TICKET_FIELD_KEYS.includes(key)),
    [missingFields]
  );
  const uploadPrefix = currentWorker ? bulkUploadPrefix(currentWorker) : "";

  const patchCurrentWorker = (patch: Partial<BulkOnboardingWorker>) => {
    setWorkers((current) =>
      current.map((worker, index) =>
        index === currentIndex ? { ...worker, ...patch } : worker
      )
    );
  };

  const applyFile = useCallback((file: File) => {
    setParseError(null);
    setVocError(null);
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
      setDraft(buildWizardDraft(parsed.workers[0]));
      setFieldErrors({});
      setPhase("fix");
    };
    reader.onerror = () => {
      setParseError("Unable to read that file.");
    };
    reader.readAsText(file, "UTF-8");
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
    const keysToMerge = Array.from(
      new Set([...missingFields, ...BULK_TICKET_FIELD_KEYS])
    );

    for (const key of keysToMerge) {
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

    const vocValidation = validateVocDrafts(vocsToDrafts(merged.vocs ?? []));
    if (vocValidation) {
      setVocError(vocValidation);
      return;
    }
    setVocError(null);

    const normalized = normalizeBulkOnboardingWorker(merged);
    const remaining = getInvalidBulkOnboardingFields(normalized);
    if (remaining.length > 0) {
      setWorkers((current) =>
        current.map((worker, index) => (index === currentIndex ? normalized : worker))
      );
      setDraft(buildWizardDraft(normalized));
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
    setFieldErrors({});

    if (currentIndex + 1 >= workers.length) {
      setDraft({});
      setPhase("summary");
      return;
    }

    const nextWorker = workers[currentIndex + 1];
    setDraft(nextWorker ? buildWizardDraft(nextWorker) : {});
    setCurrentIndex((index) => index + 1);
  };

  const handleSubmitAll = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await submitBulkOnboarding(
        workers.map((worker) => ({
          ...worker,
          vocs: serializeBulkOnboardingVocs(worker.vocs),
        }))
      );
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
    setVocError(null);
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

          {filledFields.length > 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Loaded from CSV
              </p>
              <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                {filledFields.map((key) => (
                  <div key={key} className="min-w-0">
                    <dt className="text-xs text-slate-500">
                      {BULK_ONBOARDING_FIELD_LABELS[key]}
                    </dt>
                    <dd className="truncate font-medium text-slate-800">
                      {currentWorker[key]}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          {otherMissingFields.length === 0 &&
          !BULK_TICKET_FIELD_KEYS.some((key) => missingFields.includes(key)) ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              All required text fields for this worker are complete. Add ticket files and VOCs
              below if needed.
            </p>
          ) : otherMissingFields.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {otherMissingFields.map((key) => {
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
          ) : null}

          <div className={sectionClass}>
            <h3 className="text-sm font-semibold text-orange-600">White Card</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label className="space-y-1">
                <span className={labelClass}>White card number</span>
                <input
                  className={inputClass}
                  value={draft.white_card_number ?? currentWorker.white_card_number ?? ""}
                  onChange={(event) => updateDraft("white_card_number", event.target.value)}
                />
                {fieldErrors.white_card_number ? (
                  <p className="text-xs text-red-600">{fieldErrors.white_card_number}</p>
                ) : null}
              </label>
              <label className="space-y-1">
                <span className={labelClass}>White card issue date</span>
                <input
                  type="date"
                  className={inputClass}
                  value={draft.white_card_issue_date ?? currentWorker.white_card_issue_date ?? ""}
                  onChange={(event) => updateDraft("white_card_issue_date", event.target.value)}
                />
                {fieldErrors.white_card_issue_date ? (
                  <p className="text-xs text-red-600">{fieldErrors.white_card_issue_date}</p>
                ) : null}
              </label>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <DocumentCapture
                label="White Card Photo"
                file={null}
                onFileChange={() => undefined}
                uploadedUrl={currentWorker.white_card_photo_url || null}
                existingUrl={currentWorker.white_card_photo_url || null}
                uploadPath={`${uploadPrefix}/white-card-photo`}
                onUploaded={(url) =>
                  patchCurrentWorker({ white_card_photo_url: url ?? "" })
                }
              />
              <DocumentCapture
                label="White Card Document"
                file={null}
                onFileChange={() => undefined}
                uploadedUrl={currentWorker.white_card_doc_url || null}
                existingUrl={currentWorker.white_card_doc_url || null}
                uploadPath={`${uploadPrefix}/white-card-doc`}
                onUploaded={(url) =>
                  patchCurrentWorker({ white_card_doc_url: url ?? "" })
                }
              />
            </div>
          </div>

          <div className={sectionClass}>
            <h3 className="text-sm font-semibold text-orange-600">Silica Certificate</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label className="space-y-1">
                <span className={labelClass}>Silica certificate number</span>
                <input
                  className={inputClass}
                  value={draft.silica_cert_number ?? currentWorker.silica_cert_number ?? ""}
                  onChange={(event) => updateDraft("silica_cert_number", event.target.value)}
                />
                {fieldErrors.silica_cert_number ? (
                  <p className="text-xs text-red-600">{fieldErrors.silica_cert_number}</p>
                ) : null}
              </label>
              <label className="space-y-1">
                <span className={labelClass}>Silica certificate issue date</span>
                <input
                  type="date"
                  className={inputClass}
                  value={draft.silica_cert_issue_date ?? currentWorker.silica_cert_issue_date ?? ""}
                  onChange={(event) =>
                    updateDraft("silica_cert_issue_date", event.target.value)
                  }
                />
                {fieldErrors.silica_cert_issue_date ? (
                  <p className="text-xs text-red-600">{fieldErrors.silica_cert_issue_date}</p>
                ) : null}
              </label>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <DocumentCapture
                label="Silica Certificate Photo"
                file={null}
                onFileChange={() => undefined}
                uploadedUrl={currentWorker.silica_cert_photo_url || null}
                existingUrl={currentWorker.silica_cert_photo_url || null}
                uploadPath={`${uploadPrefix}/silica-cert-photo`}
                onUploaded={(url) =>
                  patchCurrentWorker({ silica_cert_photo_url: url ?? "" })
                }
              />
              <DocumentCapture
                label="Silica Certificate Document"
                file={null}
                onFileChange={() => undefined}
                uploadedUrl={currentWorker.silica_cert_doc_url || null}
                existingUrl={currentWorker.silica_cert_doc_url || null}
                uploadPath={`${uploadPrefix}/silica-cert-doc`}
                onUploaded={(url) =>
                  patchCurrentWorker({ silica_cert_doc_url: url ?? "" })
                }
              />
            </div>
          </div>

          <div className={sectionClass}>
            <h3 className="text-sm font-semibold text-orange-600">
              VOCs (Verification of Competency)
            </h3>
            <div className="mt-3">
              <VocListEditor
                vocs={vocsToDrafts(currentWorker.vocs ?? [])}
                onChange={(drafts) => patchCurrentWorker({ vocs: vocsFromDrafts(drafts) })}
                minItems={0}
                uploadPathPrefix={`${uploadPrefix}/vocs`}
              />
            </div>
            {vocError ? <p className="mt-2 text-xs text-red-600">{vocError}</p> : null}
          </div>

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
