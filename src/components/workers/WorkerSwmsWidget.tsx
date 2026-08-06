"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertTriangle, FileText } from "lucide-react";
import {
  countPendingSwmsAssignments,
  fetchSwmsAssignmentsForWorker,
  type SwmsAssignment,
} from "@/lib/swms";
import type { SwmsDocument } from "@/lib/swms";
import WorkerSwmsSignModal from "./WorkerSwmsSignModal";
import { cardClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface WorkerSwmsWidgetProps {
  workerId: string;
}

type WorkerSwmsRow = SwmsAssignment & { swms?: SwmsDocument };

export default function WorkerSwmsWidget({ workerId }: WorkerSwmsWidgetProps) {
  const [assignments, setAssignments] = useState<WorkerSwmsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAssignment, setSelectedAssignment] = useState<WorkerSwmsRow | null>(
    null
  );

  const loadAssignments = async () => {
    setLoading(true);
    try {
      const rows = await fetchSwmsAssignmentsForWorker(workerId);
      setAssignments(Array.isArray(rows) ? rows : []);
    } catch {
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAssignments();
  }, [workerId]);

  const pendingCount = countPendingSwmsAssignments(assignments);

  return (
    <div className="space-y-3">
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

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
            Loading SWMS…
          </div>
        ) : assignments.length === 0 ? (
          <p className="text-sm text-slate-500">No SWMS assigned to you.</p>
        ) : (
          <ul className="space-y-2">
            {assignments.map((assignment) => (
              <li key={assignment.id}>
                <button
                  type="button"
                  onClick={() => setSelectedAssignment(assignment)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left hover:border-orange-300 hover:bg-orange-50/40"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {assignment.swms?.title ?? "SWMS document"}
                    </p>
                    <p className="text-xs text-slate-500">{assignment.status}</p>
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
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selectedAssignment && (
        <WorkerSwmsSignModal
          assignment={selectedAssignment}
          onClose={() => setSelectedAssignment(null)}
          onSigned={() => {
            setSelectedAssignment(null);
            loadAssignments();
          }}
        />
      )}
    </div>
  );
}
