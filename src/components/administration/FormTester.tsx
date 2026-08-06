"use client";

import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  GitCompareArrows,
  Loader2,
  MousePointerClick,
  Play,
  TestTubeDiagonal,
  X,
  XCircle,
} from "lucide-react";
import {
  FORM_SUBMISSION_TEST_DEFINITIONS,
  runAllFormSubmissionTests,
  summarizeFormTestResults,
  type FormSubmissionTestResult,
  type FormTestContext,
} from "@/lib/form-submission-tester";
import {
  runActionWorkflowTests,
  summarizeActionWorkflowResults,
  type ActionWorkflowTestResult,
} from "@/lib/action-workflow-tester";
import ActionWorkflowTester from "@/components/administration/ActionWorkflowTester";
import {
  runRegisterE2EVerificationTests,
  summarizeRegisterE2ETestResults,
  type RegisterE2EStepResult,
  type RegisterE2ETestResult,
} from "@/lib/register-e2e-tester";
import { cardClass, inputClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

type FormTesterMode = "submission" | "register-e2e" | "action-workflow";

interface FormTesterProps {
  onClose?: () => void;
  embedded?: boolean;
}

function SubmissionStatusBadge({ status }: { status: FormSubmissionTestResult["status"] }) {
  if (status === "passed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-emerald-800 ring-1 ring-inset ring-emerald-200">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Passed
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-red-800 ring-1 ring-inset ring-red-200">
        <XCircle className="h-3.5 w-3.5" />
        Failed
      </span>
    );
  }
  if (status === "skipped") {
    return (
      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-slate-600 ring-1 ring-inset ring-slate-200">
        Skipped
      </span>
    );
  }
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-blue-800 ring-1 ring-inset ring-blue-200">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Running
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-slate-500 ring-1 ring-inset ring-slate-200">
      Pending
    </span>
  );
}

function E2EStepBadge({ step }: { step: RegisterE2EStepResult }) {
  if (step.status === "passed") {
    return (
      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-800 ring-1 ring-inset ring-emerald-200">
        OK
      </span>
    );
  }
  if (step.status === "failed") {
    return (
      <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-800 ring-1 ring-inset ring-red-200">
        Failed
      </span>
    );
  }
  if (step.status === "running") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-blue-800 ring-1 ring-inset ring-blue-200">
        <Loader2 className="h-3 w-3 animate-spin" />
        Running
      </span>
    );
  }
  if (step.status === "skipped") {
    return (
      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 ring-1 ring-inset ring-slate-200">
        Skipped
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 ring-1 ring-inset ring-slate-200">
      Pending
    </span>
  );
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // ignore clipboard failures
  }
}

export function FormTesterLaunchButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-lg border border-dashed border-violet-300 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-800 hover:bg-violet-100"
      title="Temporary admin utility for validating Supabase form tables"
    >
      <TestTubeDiagonal className="h-4 w-4" />
      Test All Forms & SQL Submissions
    </button>
  );
}

export default function FormTester({ onClose, embedded = false }: FormTesterProps) {
  const [mode, setMode] = useState<FormTesterMode>("submission");
  const [running, setRunning] = useState(false);
  const [submissionResults, setSubmissionResults] = useState<FormSubmissionTestResult[]>(() =>
    FORM_SUBMISSION_TEST_DEFINITIONS.map((definition) => ({
      id: definition.id,
      table: definition.table,
      label: definition.label,
      status: "pending",
    }))
  );
  const [e2eResults, setE2eResults] = useState<RegisterE2ETestResult[]>([]);
  const [actionResults, setActionResults] = useState<ActionWorkflowTestResult[]>([]);
  const [context, setContext] = useState<FormTestContext | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const submissionSummary = useMemo(
    () => summarizeFormTestResults(submissionResults),
    [submissionResults]
  );
  const e2eSummary = useMemo(() => summarizeRegisterE2ETestResults(e2eResults), [e2eResults]);
  const actionSummary = useMemo(
    () => summarizeActionWorkflowResults(actionResults),
    [actionResults]
  );

  const runSubmissionTests = useCallback(async () => {
    setRunning(true);
    setFatalError(null);
    setCopiedId(null);

    const initial = FORM_SUBMISSION_TEST_DEFINITIONS.map((definition) => ({
      id: definition.id,
      table: definition.table,
      label: definition.label,
      status: "pending" as const,
    }));
    setSubmissionResults(initial);

    const output = await runAllFormSubmissionTests({
      onProgress: (rows) => setSubmissionResults(rows),
    });

    if (output.error) {
      setFatalError(output.error);
    }
    setContext(output.context);
    setSubmissionResults(output.results.length > 0 ? output.results : initial);
    setRunning(false);
  }, []);

  const runE2ETests = useCallback(async () => {
    setRunning(true);
    setFatalError(null);
    setCopiedId(null);
    setE2eResults([]);

    const output = await runRegisterE2EVerificationTests({
      onProgress: (rows) => setE2eResults(rows),
    });

    if (output.error) {
      setFatalError(output.error);
    }
    setContext(output.context);
    setE2eResults(output.results);
    setRunning(false);
  }, []);

  const runActionWorkflowSuite = useCallback(async () => {
    setRunning(true);
    setFatalError(null);
    setCopiedId(null);
    setActionResults([]);

    const output = await runActionWorkflowTests({
      onProgress: (rows) => setActionResults(rows),
    });

    if (output.error) {
      setFatalError(output.error);
    }
    setContext(output.context);
    setActionResults(output.results);
    setRunning(false);
  }, []);

  const shell = (
    <div className={cn(embedded ? "space-y-4" : "w-full max-w-4xl space-y-4")}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Form Submission Test Console</h2>
          <p className="mt-1 text-sm text-slate-500">
            Validate Supabase inserts, register mapping, or operational button workflow mutations.
          </p>
        </div>
        {!embedded && onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode("submission")}
          className={cn(
            "rounded-lg px-3 py-2 text-sm font-semibold",
            mode === "submission"
              ? "bg-violet-600 text-white"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          )}
        >
          SQL Submission Tests
        </button>
        <button
          type="button"
          onClick={() => setMode("register-e2e")}
          className={cn(
            "rounded-lg px-3 py-2 text-sm font-semibold",
            mode === "register-e2e"
              ? "bg-emerald-600 text-white"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          )}
        >
          Verify Register Flow & Mapping
        </button>
        <button
          type="button"
          onClick={() => setMode("action-workflow")}
          className={cn(
            "rounded-lg px-3 py-2 text-sm font-semibold",
            mode === "action-workflow"
              ? "bg-sky-600 text-white"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          )}
        >
          Full System Button Actions Diagnostic
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {mode === "submission" ? (
          <button
            type="button"
            onClick={() => void runSubmissionTests()}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? "Running Tests…" : "Run All Tests"}
          </button>
        ) : mode === "register-e2e" ? (
          <button
            type="button"
            onClick={() => void runE2ETests()}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <GitCompareArrows className="h-4 w-4" />
            )}
            {running ? "Verifying Registers…" : "Verify Register Flow & Mapping"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void runActionWorkflowSuite()}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MousePointerClick className="h-4 w-4" />
            )}
            {running ? "Running Button Diagnostics…" : "Run Button Actions Diagnostic"}
          </button>
        )}

        {mode === "submission" ? (
          <p className="text-sm text-slate-600">
            {submissionSummary.passed} passed · {submissionSummary.failed} failed ·{" "}
            {submissionSummary.skipped} skipped · {submissionSummary.total} total
          </p>
        ) : mode === "register-e2e" ? (
          <p className="text-sm text-slate-600">
            {e2eSummary.mapped} mapped · {e2eSummary.failed} failed · {e2eSummary.skipped}{" "}
            skipped · {e2eSummary.total} total
          </p>
        ) : (
          <p className="text-sm text-slate-600">
            {actionSummary.passed} passed · {actionSummary.failed} failed ·{" "}
            {actionSummary.skipped} skipped · {actionSummary.total} total
          </p>
        )}
      </div>

      {context ? (
        <div className={cn(cardClass, "grid gap-2 p-4 text-xs text-slate-600 sm:grid-cols-2")}>
          <p>
            <strong>Worker:</strong> {context.workerName} ({context.workerId})
          </p>
          <p>
            <strong>Project:</strong> {context.projectName} ({context.projectId})
          </p>
          <p>
            <strong>Plant ID:</strong> {context.plantId ?? "Not found"}
          </p>
          <p>
            <strong>Form Template ID:</strong> {context.formTemplateId ?? "Not found"}
          </p>
        </div>
      ) : null}

      {fatalError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {fatalError}
        </div>
      ) : null}

      {mode === "submission" ? (
        <div className={cn(cardClass, "overflow-hidden")}>
          <ul className="divide-y divide-slate-100">
            {submissionResults.map((result) => (
              <li key={result.id} className="space-y-3 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{result.label}</p>
                    <p className="text-xs text-slate-500">
                      public.{result.table}
                      {result.durationMs != null ? ` · ${result.durationMs}ms` : ""}
                    </p>
                  </div>
                  <SubmissionStatusBadge status={result.status} />
                </div>

                {result.status === "passed" && result.cleanupWarning ? (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{result.cleanupWarning}</span>
                  </div>
                ) : null}

                {result.status === "failed" ? (
                  <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-900">
                    <p>
                      <strong>{result.errorCode ?? "ERROR"}:</strong> {result.errorMessage}
                    </p>
                    {result.fixSql ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                          Suggested Fix SQL
                        </p>
                        <textarea
                          readOnly
                          value={result.fixSql}
                          className={cn(inputClass, "min-h-[88px] font-mono text-xs")}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            void copyText(result.fixSql ?? "");
                            setCopiedId(result.id);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {copiedId === result.id ? "Copied" : "Copy SQL Fix"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {result.status === "skipped" && result.errorMessage ? (
                  <p className="text-sm text-slate-600">{result.errorMessage}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : mode === "register-e2e" ? (
        <div className={cn(cardClass, "overflow-hidden")}>
          {e2eResults.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">
              Run Verify Register Flow & Mapping to execute the end-to-end register checks.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {e2eResults.map((result) => (
                <li key={result.id} className="space-y-3 px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{result.label}</p>
                      <p className="text-xs text-slate-500">
                        {result.formType} → {result.registerName}
                        {result.marker ? ` · ${result.marker}` : ""}
                        {result.durationMs != null ? ` · ${result.durationMs}ms` : ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {result.mappedCorrectly ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-emerald-800 ring-1 ring-inset ring-emerald-200">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Mapped Correctly
                        </span>
                      ) : result.status === "failed" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-red-800 ring-1 ring-inset ring-red-200">
                          <XCircle className="h-3.5 w-3.5" />
                          Mapping Failed
                        </span>
                      ) : result.status === "skipped" ? (
                        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-slate-600 ring-1 ring-inset ring-slate-200">
                          Skipped
                        </span>
                      ) : result.status === "running" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-blue-800 ring-1 ring-inset ring-blue-200">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Running
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Submission → Query → Mapping Check
                    </p>
                    {result.steps.map((stepRow) => (
                      <div
                        key={`${result.id}-${stepRow.step}`}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium text-slate-900">{stepRow.label}</p>
                          <E2EStepBadge step={stepRow} />
                        </div>
                        {stepRow.message ? (
                          <p className="mt-1 text-sm text-slate-600">{stepRow.message}</p>
                        ) : null}
                        {stepRow.details && stepRow.details.length > 0 ? (
                          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-500">
                            {stepRow.details.map((detail) => (
                              <li key={detail}>{detail}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  {result.cleanupWarning ? (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{result.cleanupWarning}</span>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <ActionWorkflowTester results={actionResults} running={running} />
      )}
    </div>
  );

  if (embedded) {
    return shell;
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        {shell}
      </div>
    </div>
  );
}
