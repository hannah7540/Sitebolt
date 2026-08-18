"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileText, Loader2 } from "lucide-react";
import {
  countPendingSwmsAssignments,
  formatSwmsVersionLabel,
  getSwmsDocumentUrl,
  resolveSwmsScope,
  type SwmsAssignment,
  type SwmsDocument,
} from "@/lib/swms";
import WorkerSwmsSignModal from "./WorkerSwmsSignModal";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import { cardClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface WorkerSwmsWidgetProps {
  workerId: string;
}

type WorkerSwmsRow = SwmsAssignment & { swms?: SwmsDocument };

type SwmsTab = "pending" | "signed";

function formatSwmsCategory(scope: string | null | undefined): string {
  return scope === "site_specific" ? "Site-Specific" : "Company";
}

export default function WorkerSwmsWidget({ workerId }: WorkerSwmsWidgetProps) {
  const [assignments, setAssignments] = useState<WorkerSwmsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<SwmsTab>("pending");
  const [selectedAssignment, setSelectedAssignment] = useState<WorkerSwmsRow | null>(
    null
  );
  const { toast, showSuccess, dismissToast } = useFormToast();

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/worker/swms", { cache: "no-store" });
      const payload = (await response.json()) as {
        assignments?: WorkerSwmsRow[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load SWMS assignments.");
      }

      setAssignments(Array.isArray(payload.assignments) ? payload.assignments : []);
    } catch {
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAssignments();
  }, [workerId, loadAssignments]);

  const pendingAssignments = useMemo(
    () => assignments.filter((row) => row.status === "Pending"),
    [assignments]
  );
  const signedAssignments = useMemo(
    () => assignments.filter((row) => row.status === "Signed"),
    [assignments]
  );
  const pendingCount = countPendingSwmsAssignments(assignments);
  const visibleAssignments =
    activeTab === "pending" ? pendingAssignments : signedAssignments;

  return (
    <div className="space-y-3">
      {toast ? (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      ) : null}

      {pendingCount > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            You have <strong>{pendingCount}</strong> outstanding SWMS document
            {pendingCount === 1 ? "" : "s"} requiring your signature.
          </p>
        </div>
      )}

      <div className={cn(cardClass, "p-4")}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-orange-500" />
            <h3 className="font-semibold text-slate-900">SWMS Documents</h3>
          </div>
          {pendingCount > 0 && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {pendingCount} pending
            </span>
          )}
        </div>

        <div className="mb-3 flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("pending")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold",
              activeTab === "pending"
                ? "bg-amber-100 text-amber-900"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            Pending ({pendingAssignments.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("signed")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold",
              activeTab === "signed"
                ? "bg-emerald-100 text-emerald-900"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            Signed ({signedAssignments.length})
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
            Loading SWMS…
          </div>
        ) : visibleAssignments.length === 0 ? (
          <p className="text-sm text-slate-500">
            {activeTab === "pending"
              ? "No pending SWMS assigned to you."
              : "No signed SWMS yet."}
          </p>
        ) : (
          <ul className="space-y-2">
            {visibleAssignments.map((assignment) => {
              const swms = assignment.swms;
              const category = formatSwmsCategory(resolveSwmsScope(swms));
              const version = formatSwmsVersionLabel(swms?.version);
              const documentUrl = getSwmsDocumentUrl(swms);

              return (
                <li key={assignment.id}>
                  <div
                    className={cn(
                      "rounded-lg border px-3 py-3",
                      assignment.status === "Pending"
                        ? "border-amber-200 bg-amber-50/40"
                        : "border-slate-200 bg-white"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {swms?.title ?? "SWMS document"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {version} · {category}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                          assignment.status === "Pending"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-100 text-emerald-800"
                        )}
                      >
                        {assignment.status}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {documentUrl ? (
                        <a
                          href={documentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Open Document
                        </a>
                      ) : null}
                      {assignment.status === "Pending" ? (
                        <button
                          type="button"
                          onClick={() => setSelectedAssignment(assignment)}
                          className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600"
                        >
                          View Document & Sign
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSelectedAssignment(assignment)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          View Signed Record
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selectedAssignment && (
        <WorkerSwmsSignModal
          assignment={selectedAssignment}
          onClose={() => setSelectedAssignment(null)}
          onSigned={() => {
            setSelectedAssignment(null);
            setActiveTab("signed");
            showSuccess("SWMS signed and submitted successfully");
            void loadAssignments();
          }}
        />
      )}
    </div>
  );
}
