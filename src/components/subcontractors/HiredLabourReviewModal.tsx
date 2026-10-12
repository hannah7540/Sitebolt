"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { mutateHiredLabour, type HiredLabourRecord } from "@/lib/hired-labour";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import {
  labelClass,
  modalBodyClass,
  modalOverlayClass,
  modalShellClass,
  modalStickyFooterClass,
} from "@/lib/ui-classes";

interface HiredLabourReviewModalProps {
  worker: HiredLabourRecord;
  projectLabel: string;
  onClose: () => void;
  onChanged: () => void;
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-slate-900">{value?.trim() || "—"}</p>
    </div>
  );
}

function FileLink({ label, url }: { label: string; url: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block text-sm font-semibold text-orange-600 hover:underline"
        >
          Open file
        </a>
      ) : (
        <p className="mt-1 text-sm text-slate-900">—</p>
      )}
    </div>
  );
}

export default function HiredLabourReviewModal({
  worker,
  projectLabel,
  onClose,
  onChanged,
}: HiredLabourReviewModalProps) {
  const [notes, setNotes] = useState(worker.rejection_notes ?? "");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = getWorkerDisplayName(worker, "Hired labour");

  const run = async (action: "approve" | "reject") => {
    if (action === "reject" && !notes.trim()) {
      setRejecting(true);
      setError("Add rejection notes so the worker knows what to fix.");
      return;
    }
    setBusy(action);
    setError(null);
    const result = await mutateHiredLabour({
      action,
      workerId: worker.id,
      rejectionNotes: notes.trim(),
    });
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    onChanged();
    onClose();
  };

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={`${modalShellClass} max-w-2xl`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
              Awaiting approval
            </p>
            <h2 className="text-lg font-semibold text-slate-900">{name}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className={modalBodyClass + " space-y-6"}>
          {error ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {error}
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Detail label="Email" value={worker.email} />
            <Detail label="Phone" value={worker.phone} />
            <Detail label="State" value={worker.state} />
            <Detail label="Project" value={projectLabel} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">White Card</h3>
            <div className="mt-2 grid gap-4 sm:grid-cols-3">
              <Detail label="Number" value={worker.white_card_number} />
              <Detail label="Date" value={worker.white_card_date} />
              <FileLink label="File" url={worker.white_card_file_url} />
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Silica certificate</h3>
            <div className="mt-2 grid gap-4 sm:grid-cols-3">
              <Detail label="Number" value={worker.silica_cert_number} />
              <Detail label="Date" value={worker.silica_cert_date} />
              <FileLink label="File" url={worker.silica_cert_file_url} />
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Emergency contact</h3>
            <div className="mt-2 grid gap-4 sm:grid-cols-3">
              <Detail label="Name" value={worker.emergency_contact_name} />
              <Detail label="Number" value={worker.emergency_contact_number} />
              <Detail label="Relationship" value={worker.emergency_contact_relationship} />
            </div>
          </div>
          {rejecting || worker.hired_labour_status === "rejected" ? (
            <label className="block">
              <span className={labelClass}>Rejection notes</span>
              <textarea
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Tell them what needs to be corrected."
              />
            </label>
          ) : null}
        </div>
        <div className={modalStickyFooterClass + " flex justify-end gap-2 pb-4"}>
          <button
            type="button"
            onClick={() => void run("reject")}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
          >
            {busy === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Reject
          </button>
          <button
            type="button"
            onClick={() => void run("approve")}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
