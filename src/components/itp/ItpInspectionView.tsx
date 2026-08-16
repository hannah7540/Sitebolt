"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Loader2,
} from "lucide-react";
import {
  ITP_ITEM_STATUS_LABELS,
  ITP_POINT_TYPE_BADGE,
  ITP_POINT_TYPE_LABELS,
  ITP_STATUS_LABELS,
} from "@/lib/itp-templates";
import {
  appendItpItemPhoto,
  fetchItpById,
  getBlockingHoldPointItems,
  hasBlockingHoldPoints,
  markItpInProgress,
  type ProjectItp,
  type ProjectItpItem,
  updateItpItemStatus,
  updateItpStatus,
} from "@/lib/itp-service";
import { uploadItpPhoto } from "@/lib/itp-upload";
import ItpSignOffModal from "./ItpSignOffModal";
import { cardClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface ItpInspectionViewProps {
  itpId: string;
  inspectorName?: string;
  onBack: () => void;
  onUpdated: () => void;
}

function StatusButton({
  label,
  active,
  tone,
  onClick,
  disabled,
}: {
  label: string;
  active: boolean;
  tone: "pass" | "fail" | "na";
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded px-2 py-1 text-xs font-semibold transition disabled:opacity-50",
        active && tone === "pass" && "bg-emerald-600 text-white",
        active && tone === "fail" && "bg-red-600 text-white",
        active && tone === "na" && "bg-slate-600 text-white",
        !active && "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      )}
    >
      {label}
    </button>
  );
}

export default function ItpInspectionView({
  itpId,
  inspectorName = "",
  onBack,
  onUpdated,
}: ItpInspectionViewProps) {
  const [itp, setItp] = useState<ProjectItp | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [signOffItem, setSignOffItem] = useState<ProjectItpItem | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadItp = useCallback(async () => {
    setLoading(true);
    const row = await fetchItpById(itpId);
    setItp(row);
    setLoading(false);
  }, [itpId]);

  useEffect(() => {
    void loadItp();
  }, [loadItp]);

  const items = itp?.items ?? [];
  const blockingHoldPoints = getBlockingHoldPointItems(items);
  const holdPointBlocked = hasBlockingHoldPoints(items);

  const handleItemStatus = async (item: ProjectItpItem, status: ProjectItpItem["status"]) => {
    setActionId(item.id);
    await markItpInProgress(itpId);
    const { error } = await updateItpItemStatus(item.id, status);
    setActionId(null);
    if (error) {
      setMessage(error);
      return;
    }
    await loadItp();
    onUpdated();
  };

  const handlePhotoUpload = async (item: ProjectItpItem, file: File) => {
    setActionId(item.id);
    setMessage(null);
    const upload = await uploadItpPhoto(file, itpId, item.id);
    if (!upload.url) {
      setActionId(null);
      setMessage(upload.error ?? "Photo upload failed");
      return;
    }
    const { error } = await appendItpItemPhoto(item.id, upload.url);
    setActionId(null);
    if (error) {
      setMessage(error);
      return;
    }
    await loadItp();
  };

  const handleSubmitItp = async () => {
    if (holdPointBlocked) {
      setMessage("Hold Points must be cleared before final sign-off.");
      return;
    }
    const { error } = await updateItpStatus(itpId, "submitted");
    if (error) {
      setMessage(error);
      return;
    }
    await loadItp();
    onUpdated();
  };

  const handleApproveItp = async () => {
    if (holdPointBlocked) {
      setMessage("Hold Points must be cleared before approval.");
      return;
    }
    const { error } = await updateItpStatus(itpId, "approved");
    if (error) {
      setMessage(error);
      return;
    }
    await loadItp();
    onUpdated();
  };

  if (loading || !itp) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
        Loading inspection checklist…
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 text-sm font-semibold text-orange-600 hover:text-orange-700"
      >
        ← Back to ITP register
      </button>

      <div className={`${cardClass} mb-6 p-6`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-orange-500">
              Inspection Test Plan
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">
              {itp.itp_number} — {itp.title}
            </h1>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
              <span>Rev {itp.revision}</span>
              <span>{itp.trade_category}</span>
              {itp.subcontractor_name ? <span>Sub: {itp.subcontractor_name}</span> : null}
              {itp.location_area ? <span>Location: {itp.location_area}</span> : null}
            </div>
          </div>
          <span
            className={cn(
              "rounded px-3 py-1 text-xs font-bold uppercase tracking-wide",
              itp.status === "approved" && "bg-emerald-100 text-emerald-800",
              itp.status === "submitted" && "bg-blue-100 text-blue-800",
              itp.status === "in_progress" && "bg-amber-100 text-amber-800",
              itp.status === "draft" && "bg-slate-100 text-slate-700"
            )}
          >
            {ITP_STATUS_LABELS[itp.status]}
          </span>
        </div>

        {holdPointBlocked ? (
          <div className="mt-4 flex items-start gap-3 rounded-lg border-2 border-red-400 bg-red-50 px-4 py-3 text-sm text-red-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-bold">Hold Point Gate — Final sign-off blocked</p>
              <p className="mt-1">
                {blockingHoldPoints.length} Hold Point(s) are pending or non-conforming. Clear
                all Hold Points before submitting or approving this ITP.
              </p>
              <ul className="mt-2 list-inside list-disc text-xs">
                {blockingHoldPoints.map((item) => (
                  <li key={item.id}>
                    #{item.item_number} {item.description} ({ITP_ITEM_STATUS_LABELS[item.status]})
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        {message ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {message}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {itp.status === "draft" || itp.status === "in_progress" ? (
            <button
              type="button"
              onClick={() => void handleSubmitItp()}
              disabled={holdPointBlocked}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              Submit ITP
            </button>
          ) : null}
          {itp.status === "submitted" ? (
            <button
              type="button"
              onClick={() => void handleApproveItp()}
              disabled={holdPointBlocked}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              Approve ITP
            </button>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[960px] w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-4 py-3"># / Inspection Point</th>
              <th className="px-4 py-3">Acceptance Criteria</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Evidence</th>
              <th className="px-4 py-3">Sign-Off</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100 align-top">
                <td className="px-4 py-4">
                  <p className="font-semibold text-slate-900">#{item.item_number}</p>
                  <p className="mt-1 text-slate-700">{item.description}</p>
                </td>
                <td className="px-4 py-4 text-slate-600">
                  {item.acceptance_criteria || "—"}
                </td>
                <td className="px-4 py-4">
                  <span
                    className={cn(
                      "inline-flex rounded border px-2 py-0.5 text-xs font-bold",
                      ITP_POINT_TYPE_BADGE[item.point_type]
                    )}
                  >
                    {item.point_type} — {ITP_POINT_TYPE_LABELS[item.point_type]}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-1">
                    <StatusButton
                      label="Pass"
                      tone="pass"
                      active={item.status === "conforming"}
                      disabled={actionId === item.id}
                      onClick={() => void handleItemStatus(item, "conforming")}
                    />
                    <StatusButton
                      label="Fail"
                      tone="fail"
                      active={item.status === "non_conforming"}
                      disabled={actionId === item.id}
                      onClick={() => void handleItemStatus(item, "non_conforming")}
                    />
                    <StatusButton
                      label="N/A"
                      tone="na"
                      active={item.status === "na"}
                      disabled={actionId === item.id}
                      onClick={() => void handleItemStatus(item, "na")}
                    />
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-2">
                    {item.photo_urls.map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="block h-12 w-12 overflow-hidden rounded border border-slate-200"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="Evidence" className="h-full w-full object-cover" />
                      </a>
                    ))}
                  </div>
                  <label className="mt-2 inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-orange-600 hover:text-orange-700">
                    <Camera className="h-3.5 w-3.5" />
                    Add Photo
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={actionId === item.id}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handlePhotoUpload(item, file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </td>
                <td className="px-4 py-4">
                  {item.signature_url ? (
                    <div className="space-y-1 text-xs">
                      <p className="font-semibold text-slate-800">{item.inspector_name}</p>
                      <p className="text-slate-500">
                        {item.signed_off_at
                          ? new Date(item.signed_off_at).toLocaleString()
                          : ""}
                      </p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.signature_url}
                        alt="Signature"
                        className="h-10 rounded border border-slate-200 bg-white"
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSignOffItem(item)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-orange-50 hover:text-orange-600"
                    >
                      Sign Off
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {signOffItem ? (
        <ItpSignOffModal
          itpId={itpId}
          itemId={signOffItem.id}
          itemDescription={`#${signOffItem.item_number} ${signOffItem.description}`}
          defaultInspectorName={inspectorName}
          onClose={() => setSignOffItem(null)}
          onSigned={() => {
            void loadItp();
            onUpdated();
          }}
        />
      ) : null}
    </div>
  );
}
