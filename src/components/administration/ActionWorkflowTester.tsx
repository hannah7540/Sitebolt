"use client";

import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import type {
  ActionWorkflowStepResult,
  ActionWorkflowTestResult,
} from "@/lib/action-workflow-tester";
import { cardClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface ActionWorkflowTesterProps {
  results: ActionWorkflowTestResult[];
  running: boolean;
}

function StepBadge({ step }: { step: ActionWorkflowStepResult }) {
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

export default function ActionWorkflowTester({ results, running }: ActionWorkflowTesterProps) {
  if (!running && results.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-slate-500">
        Run Full System Button Actions Diagnostic to execute operational workflow mutations against
        mock test records.
      </p>
    );
  }

  return (
    <div className={cn(cardClass, "overflow-hidden")}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Module</th>
              <th className="px-4 py-3">Target Button</th>
              <th className="px-4 py-3">Action Execution</th>
              <th className="px-4 py-3">State Transition</th>
              <th className="px-4 py-3 text-right">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {results.map((result) => {
              const setupStep = result.steps.find((row) => row.step === "setup");
              const executeStep = result.steps.find((row) => row.step === "execute");
              const verifyStep = result.steps.find((row) => row.step === "verify");

              return (
                <tr key={result.id} className="align-top">
                  <td className="px-4 py-4">
                    <p className="font-semibold text-slate-900">{result.module}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      public.{result.targetTable}
                      {result.durationMs != null ? ` · ${result.durationMs}ms` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-medium text-slate-800">{result.buttonLabel}</p>
                    {setupStep?.message ? (
                      <p className="mt-1 text-xs text-slate-500">{setupStep.message}</p>
                    ) : null}
                    {setupStep?.details && setupStep.details.length > 0 ? (
                      <ul className="mt-1 list-disc pl-4 text-xs text-slate-400">
                        {setupStep.details.map((detail) => (
                          <li key={detail}>{detail}</li>
                        ))}
                      </ul>
                    ) : null}
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Execute
                        </span>
                        {executeStep ? <StepBadge step={executeStep} /> : null}
                      </div>
                      {executeStep?.message ? (
                        <p className="text-xs text-slate-600">{executeStep.message}</p>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Verify
                        </span>
                        {verifyStep ? <StepBadge step={verifyStep} /> : null}
                      </div>
                      {verifyStep?.message ? (
                        <p className="text-xs text-slate-600">{verifyStep.message}</p>
                      ) : null}
                      {verifyStep?.details && verifyStep.details.length > 0 ? (
                        <ul className="list-disc pl-4 text-xs text-slate-400">
                          {verifyStep.details.map((detail) => (
                            <li key={detail}>{detail}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right">
                    {result.actionPassed ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-emerald-800 ring-1 ring-inset ring-emerald-200">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Action Passed
                      </span>
                    ) : result.status === "failed" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-red-800 ring-1 ring-inset ring-red-200">
                        <XCircle className="h-3.5 w-3.5" />
                        Action Failed
                      </span>
                    ) : result.status === "running" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-blue-800 ring-1 ring-inset ring-blue-200">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Running
                      </span>
                    ) : result.status === "skipped" ? (
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-slate-600 ring-1 ring-inset ring-slate-200">
                        Skipped
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-slate-400 ring-1 ring-inset ring-slate-200">
                        Pending
                      </span>
                    )}
                    {result.cleanupWarning ? (
                      <div className="mt-2 flex items-start gap-1 text-left text-xs text-amber-800">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{result.cleanupWarning}</span>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
