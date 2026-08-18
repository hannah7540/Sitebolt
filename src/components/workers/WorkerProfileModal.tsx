"use client";

import { useEffect, useState } from "react";
import { X, Loader2, AlertTriangle, ExternalLink } from "lucide-react";
import type { Worker, WorkerVoc } from "@/lib/supabase";
import {
  fetchWorkerVocs,
  insertWorkerVocs,
  updateWorkerStatusFromVocs,
} from "@/lib/supabase";
import { uploadWorkerDocumentSafe } from "@/lib/worker-doc-upload";
import { resolveWorkerAssignedProjectName } from "@/lib/project-assignments";
import {
  getTicketBadgeLabel,
  getWorkerTicketStatus,
  getAllExpiryWarnings,
} from "@/lib/worker-compliance";
import { getTicketStatus, nullIfBlankWorkerDate } from "@/lib/worker-utils";
import type { VocDraft } from "@/lib/voc-utils";
import VocListEditor from "./VocListEditor";
import { cn } from "@/lib/utils";
import { modalOverlayClass, modalClass } from "@/lib/ui-classes";

interface WorkerProfileModalProps {
  worker: Worker;
  initialVocs?: WorkerVoc[];
  onClose: () => void;
  onSaved?: () => void;
}

function ExistingVocCard({ voc }: { voc: WorkerVoc }) {
  const status = getTicketStatus(voc.expiry_date);
  const styles = {
    valid: "border-emerald-200 bg-emerald-50",
    expires_soon: "border-amber-200 bg-amber-50",
    expired: "border-red-200 bg-red-50",
    unknown: "border-slate-200 bg-slate-50",
  };
  const badgeStyles = {
    valid: "bg-emerald-100 text-emerald-800",
    expires_soon: "bg-amber-100 text-amber-800",
    expired: "bg-red-100 text-red-800",
    unknown: "bg-slate-100 text-slate-600",
  };

  return (
    <div className={cn("rounded-xl border p-4", styles[status])}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-900">{voc.title}</p>
          {voc.issuing_org && (
            <p className="text-xs text-slate-500">{voc.issuing_org}</p>
          )}
        </div>
        <span
          className={cn(
            "shrink-0 rounded px-2 py-0.5 text-xs font-bold",
            badgeStyles[status]
          )}
        >
          {getTicketBadgeLabel(status)}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500">
        <span>Issued: {voc.issue_date ?? "—"}</span>
        <span>Expires: {voc.expiry_date ?? "—"}</span>
      </div>
      {voc.document_url && (
        <a
          href={voc.document_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs text-sky-400 hover:underline"
        >
          <ExternalLink className="h-3 w-3" /> View document
        </a>
      )}
    </div>
  );
}

export default function WorkerProfileModal({
  worker,
  initialVocs = [],
  onClose,
  onSaved,
}: WorkerProfileModalProps) {
  const [existingVocs, setExistingVocs] = useState<WorkerVoc[]>(initialVocs);
  const [newVocs, setNewVocs] = useState<VocDraft[]>([]);
  const [loadingVocs, setLoadingVocs] = useState(initialVocs.length === 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialVocs.length > 0) {
      setExistingVocs(initialVocs);
      setLoadingVocs(false);
      return;
    }
    let cancelled = false;
    fetchWorkerVocs(worker.id).then((data) => {
      if (!cancelled) {
        setExistingVocs(data);
        setLoadingVocs(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [worker.id, initialVocs]);

  const ticketStatus = getWorkerTicketStatus(worker, existingVocs);
  const warnings = getAllExpiryWarnings(worker, existingVocs);

  const handleSaveNewVocs = async () => {
    const toSave = newVocs.filter((v) => v.title.trim());
    if (toSave.length === 0) return;

    setSaving(true);
    setError(null);

    try {
      const uploadPrefix = `workers/${worker.id}/vocs/${Date.now()}`;
      const prepared = await Promise.all(
        toSave.map(async (voc, i) => ({
          title: voc.title.trim(),
          issuing_org: voc.issuing_org || null,
          issue_date: nullIfBlankWorkerDate(voc.issue_date),
          expiry_date: nullIfBlankWorkerDate(voc.expiry_date),
          document_url: voc.file
            ? await uploadWorkerDocumentSafe(
                voc.file,
                `${uploadPrefix}/${i}-${voc.title.replace(/[^a-z0-9]/gi, "_")}`
              )
            : null,
        }))
      );

      const { error: insertError } = await insertWorkerVocs(worker.id, prepared);
      if (insertError) {
        setError(insertError);
        return;
      }

      const refreshed = await fetchWorkerVocs(worker.id);
      setExistingVocs(refreshed);
      setNewVocs([]);
      const { error: statusError } = await updateWorkerStatusFromVocs(
        worker.id,
        worker.drivers_licence_expiry,
        refreshed.map((v) => v.expiry_date)
      );
      if (statusError) {
        throw new Error(statusError);
      }
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save VOCs.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={modalOverlayClass}>
      <div className={cn(modalClass, "max-w-2xl")}>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-500 hover:text-slate-900"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-xl font-bold text-slate-900">{worker.full_name}</h2>
        <p className="mt-1 text-sm text-slate-500">Worker profile & VOC compliance</p>
        <p className="mt-2 text-xs text-slate-500">
          Self-service induction:{" "}
          <a
            href={`/portal/onboarding/${worker.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-600 hover:underline"
          >
            /portal/onboarding/{worker.id}
          </a>
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Email</p>
            <p className="text-sm text-slate-900">{worker.email}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Phone</p>
            <p className="text-sm text-slate-900">{worker.phone ?? "—"}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Licence Expiry</p>
            <p className="text-sm text-slate-900">
              {worker.drivers_licence_expiry ?? "—"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Project</p>
            <p className="text-sm text-slate-900">
              {resolveWorkerAssignedProjectName(worker)}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs text-slate-500">Overall ticket status:</span>
          <span
            className={cn(
              "rounded px-2 py-0.5 text-xs font-bold",
              ticketStatus === "valid" && "bg-emerald-100 text-emerald-800",
              ticketStatus === "expires_soon" && "bg-amber-100 text-amber-800",
              ticketStatus === "expired" && "bg-red-100 text-red-800",
              ticketStatus === "unknown" && "bg-slate-100 text-slate-600"
            )}
          >
            {getTicketBadgeLabel(ticketStatus)}
          </span>
        </div>

        {warnings.length > 0 && (
          <ul className="mt-3 space-y-1">
            {warnings.map((w) => (
              <li
                key={w}
                className="flex items-center gap-1.5 text-xs text-amber-400"
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {w}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6">
          <h3 className="text-sm font-semibold text-orange-600">
            VOCs (Verification of Competency)
          </h3>
          {loadingVocs ? (
            <p className="mt-2 text-sm text-slate-500">Loading VOCs…</p>
          ) : existingVocs.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No VOCs on file yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {existingVocs.map((voc) => (
                <ExistingVocCard key={voc.id} voc={voc} />
              ))}
            </div>
          )}
        </div>

        <div className="mt-6">
          <h3 className="mb-3 text-sm font-semibold text-orange-600">
            Add New VOCs
          </h3>
          {error && (
            <p className="mb-3 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
          <VocListEditor vocs={newVocs} onChange={setNewVocs} minItems={0} />
          {newVocs.some((v) => v.title.trim()) && (
            <button
              type="button"
              onClick={handleSaveNewVocs}
              disabled={saving}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving VOCs…
                </>
              ) : (
                "Save New VOCs"
              )}
            </button>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-600 hover:bg-orange-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
