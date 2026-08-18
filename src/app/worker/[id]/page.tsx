"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, HardHat, AlertTriangle, ExternalLink } from "lucide-react";
import {
  fetchWorkerById,
  fetchWorkerVocs,
  insertWorkerVocs,
  updateWorkerStatusFromVocs,
  isSupabaseConfigured,
  type Worker,
  type WorkerVoc,
} from "@/lib/supabase";
import { uploadWorkerDocumentSafe } from "@/lib/worker-doc-upload";
import {
  getTicketBadgeLabel,
  getWorkerTicketStatus,
  getAllExpiryWarnings,
} from "@/lib/worker-compliance";
import { getTicketStatus } from "@/lib/worker-utils";
import type { VocDraft } from "@/lib/voc-utils";
import VocListEditor from "@/components/workers/VocListEditor";
import { cn } from "@/lib/utils";

function ExistingVocCard({ voc }: { voc: WorkerVoc }) {
  const status = getTicketStatus(voc.expiry_date);
  const cardStyles = {
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
    <div className={cn("rounded-xl border p-4", cardStyles[status])}>
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

export default function WorkerSelfServicePage() {
  const params = useParams();
  const workerId = params.id as string;

  const [worker, setWorker] = useState<Worker | null>(null);
  const [existingVocs, setExistingVocs] = useState<WorkerVoc[]>([]);
  const [newVocs, setNewVocs] = useState<VocDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!workerId || !isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    Promise.all([fetchWorkerById(workerId), fetchWorkerVocs(workerId)]).then(
      ([w, vocs]) => {
        setWorker(w);
        setExistingVocs(vocs);
        setLoading(false);
      }
    );
  }, [workerId]);

  const handleSave = async () => {
    if (!worker) return;
    const toSave = newVocs.filter((v) => v.title.trim());
    if (toSave.length === 0) {
      setError("Add at least one VOC with a title before saving.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const uploadPrefix = `workers/${worker.id}/vocs/${Date.now()}`;
      const prepared = await Promise.all(
        toSave.map(async (voc, i) => ({
          title: voc.title.trim(),
          issuing_org: voc.issuing_org || null,
          issue_date: voc.issue_date || null,
          expiry_date: voc.expiry_date || null,
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
      setSuccess("Your VOCs have been saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save VOCs.");
    } finally {
      setSaving(false);
    }
  };

  if (!isSupabaseConfigured()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-transparent p-6 text-slate-900">
        <p className="text-amber-800">Supabase is not configured.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-transparent text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!worker) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-transparent p-6 text-slate-900">
        <p className="text-slate-500">Worker profile not found.</p>
      </div>
    );
  }

  const ticketStatus = getWorkerTicketStatus(worker, existingVocs);
  const warnings = getAllExpiryWarnings(worker, existingVocs);

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <header className="border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <HardHat className="h-6 w-6 text-orange-500" />
          <div>
            <p className="text-xs text-slate-500">SiteBolt Worker Portal</p>
            <h1 className="text-lg font-bold text-slate-900">{worker.full_name}</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 p-6">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-orange-600">Your Details</h2>
          <div className="mt-3 grid gap-2 text-sm">
            <p>
              <span className="text-slate-500">Email: </span>
              {worker.email}
            </p>
            <p>
              <span className="text-slate-500">Phone: </span>
              {worker.phone ?? "—"}
            </p>
            <p>
              <span className="text-slate-500">Licence expiry: </span>
              {worker.drivers_licence_expiry ?? "—"}
            </p>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-slate-500">Compliance status:</span>
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
        </section>

        <section>
          <h2 className="text-sm font-semibold text-orange-600">
            Your VOCs (Verification of Competency)
          </h2>
          {existingVocs.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              No VOCs on file. Add your competencies below.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {existingVocs.map((voc) => (
                <ExistingVocCard key={voc.id} voc={voc} />
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-orange-600">
            Add New VOCs
          </h2>
          {error && (
            <p className="mb-3 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
          {success && (
            <p className="mb-3 rounded-lg bg-emerald-100 px-3 py-2 text-sm text-emerald-800">
              {success}
            </p>
          )}
          <VocListEditor vocs={newVocs} onChange={setNewVocs} minItems={0} />
          {newVocs.some((v) => v.title.trim()) && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                "Submit New VOCs"
              )}
            </button>
          )}
        </section>
      </main>
    </div>
  );
}
