"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { PlantAsset, PlantPrestart, Worker } from "@/lib/supabase";
import { getPlantPrestartUnitLabel } from "@/lib/dashboard-form-utils";
import {
  collectPrestartDefectPhotoUrls,
  formatPlantPrestartDisplayDateTime,
  getPrestartDefectNotes,
  isActiveDashboardDefect,
  sortPlantPrestartsNewestFirst,
} from "@/lib/plant-prestart-utils";
import {
  ignorePlantPrestartDefect,
  markPlantPrestartDefectRead,
} from "@/lib/plant-prestart-mutations";
import ImageLightboxGallery from "@/components/ui/ImageLightboxGallery";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import { cardClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";
import { PastSubmissionsTrigger } from "@/components/dashboard/PastSubmissionsModal";

interface PlantPrestartDefectsWidgetProps {
  prestarts: PlantPrestart[];
  plant: PlantAsset[];
  workers?: Worker[];
  loading?: boolean;
  onRemoved?: (prestartId: string, patch?: Partial<PlantPrestart>) => void;
  className?: string;
  embedded?: boolean;
  onOpenPastSubmissions?: () => void;
}

function resolveOperatorName(prestart: PlantPrestart, workers: Worker[]): string {
  if (prestart.operator_name?.trim()) return prestart.operator_name.trim();
  if (prestart.operator_worker_id) {
    const worker = workers.find((row) => row.id === prestart.operator_worker_id);
    if (worker?.full_name?.trim()) return worker.full_name.trim();
  }
  return "Unknown operator";
}

export default function PlantPrestartDefectsWidget({
  prestarts,
  plant,
  workers = [],
  loading = false,
  onRemoved,
  className,
  embedded = false,
  onOpenPastSubmissions,
}: PlantPrestartDefectsWidgetProps) {
  const { toast, showError, showSuccess, dismissToast } = useFormToast();
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{
    images: Array<{ url: string; alt: string }>;
    index: number;
  } | null>(null);

  const defects = useMemo(
    () =>
      sortPlantPrestartsNewestFirst(
        prestarts.filter(
          (row) => isActiveDashboardDefect(row) && !dismissedIds.includes(row.id)
        )
      ),
    [prestarts, dismissedIds]
  );

  const removeLocally = (prestartId: string, patch?: Partial<PlantPrestart>) => {
    setDismissedIds((current) =>
      current.includes(prestartId) ? current : [...current, prestartId]
    );
    onRemoved?.(prestartId, patch);
  };

  const restoreLocally = (prestartId: string) => {
    setDismissedIds((current) => current.filter((id) => id !== prestartId));
  };

  const handleMarkRead = async (prestart: PlantPrestart) => {
    setActingId(prestart.id);
    removeLocally(prestart.id, {
      defect_reviewed: true,
      is_read: true,
      acknowledged_at: new Date().toISOString(),
    });
    const result = await markPlantPrestartDefectRead(prestart.id);
    setActingId(null);
    if (result.error) {
      restoreLocally(prestart.id);
      showError(result.error);
      return;
    }
    showSuccess("Defect marked as read");
  };

  const handleIgnore = async (prestart: PlantPrestart) => {
    setActingId(prestart.id);
    removeLocally(prestart.id, {
      defect_reviewed: true,
      defect_ignored: true,
      has_defect: false,
      is_read: true,
      acknowledged_at: new Date().toISOString(),
    });
    const result = await ignorePlantPrestartDefect({
      plantId: prestart.plant_id,
      prestartId: prestart.id,
    });
    setActingId(null);
    if (result.error) {
      restoreLocally(prestart.id);
      showError(result.error);
      return;
    }
    showSuccess("Defect ignored and cleared from plant calendar");
  };

  const body = loading ? (
    <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
      Loading plant defects…
    </div>
  ) : defects.length === 0 ? (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
      No open plant pre-start defects.
    </div>
  ) : (
    <ul className="max-h-[calc(100vh-180px)] space-y-3 overflow-y-auto pr-1">
      {defects.map((prestart) => {
        const notes = getPrestartDefectNotes(prestart);
        const photos = collectPrestartDefectPhotoUrls(prestart);
        const busy = actingId === prestart.id;
        const submittedAt = prestart.submitted_at ?? prestart.created_at;

        return (
          <li
            key={prestart.id}
            className="rounded-xl border border-red-200 bg-red-50/40 p-3"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">
                  {getPlantPrestartUnitLabel(prestart, plant)}
                </p>
                <p className="mt-0.5 text-xs text-slate-600">
                  {resolveOperatorName(prestart, workers)} ·{" "}
                  {formatPlantPrestartDisplayDateTime(submittedAt)}
                </p>
                {notes ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
                    {notes}
                  </p>
                ) : (
                  <p className="mt-2 text-sm italic text-slate-500">
                    Defect flagged with no notes.
                  </p>
                )}
                {photos.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {photos.map((url, index) => (
                      <button
                        key={`${prestart.id}-${url}`}
                        type="button"
                        onClick={() =>
                          setLightbox({
                            images: photos.map((photo, photoIndex) => ({
                              url: photo,
                              alt: `Defect photo ${photoIndex + 1}`,
                            })),
                            index,
                          })
                        }
                        className="overflow-hidden rounded-lg border border-slate-200 bg-white"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`Defect photo ${index + 1}`}
                          className="h-16 w-16 object-cover"
                        />
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleMarkRead(prestart)}
                    className="inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Mark as read
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleIgnore(prestart)}
                    className="inline-flex min-h-9 items-center rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
                  >
                    Ignore defect & mark as read
                  </button>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      <section className={cn(embedded ? className : cn(cardClass, "flex flex-col p-5", className))}>
        {!embedded ? (
          <div className="mb-4 flex items-start gap-3">
            <AlertTriangle className="h-9 w-9 shrink-0 text-red-500" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-slate-900">Plant Pre-start Defects</h2>
                {onOpenPastSubmissions ? (
                  <PastSubmissionsTrigger onClick={onOpenPastSubmissions} />
                ) : null}
              </div>
              <p className="text-sm text-slate-500">
                {loading ? "Loading…" : `${defects.length} open`}
              </p>
            </div>
            <span className="rounded-full bg-red-100 px-2.5 py-1 text-sm font-bold text-red-800">
              {defects.length}
            </span>
          </div>
        ) : null}
        {body}
      </section>
      {lightbox ? (
        <ImageLightboxGallery
          images={lightbox.images}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      ) : null}
      {toast ? (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onDismiss={dismissToast}
        />
      ) : null}
    </>
  );
}
