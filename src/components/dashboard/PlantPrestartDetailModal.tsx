"use client";

import { useMemo } from "react";
import Image from "next/image";
import { Loader2, X } from "lucide-react";
import type { PlantAsset, PlantPrestart } from "@/lib/supabase";
import {
  getPlantPrestartDisplayTitle,
  formatPrestartHours,
  getPrestartDefectLabel,
} from "@/lib/plant-prestart-utils";
import {
  PRESTART_TEMPLATES,
  type PrestartTemplate,
} from "@/lib/prestart-templates";
import { getProjectName } from "@/lib/projects";
import FormBrandingHeader from "@/components/ui/FormBrandingHeader";
import { modalOverlayClass, modalClass, sectionClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface PlantPrestartDetailModalProps {
  prestart: PlantPrestart;
  plant: PlantAsset[];
  onClose: () => void;
  onMarkRead?: () => Promise<void> | void;
  markingRead?: boolean;
}

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function PlantPrestartDetailModal({
  prestart,
  plant,
  onClose,
  onMarkRead,
  markingRead = false,
}: PlantPrestartDetailModalProps) {
  const plantAsset = plant.find((asset) => asset.id === prestart.plant_id) ?? null;
  const unitLabel = getPlantPrestartDisplayTitle(prestart, plant);
  const template = (plantAsset?.prestart_template ?? "excavator") as PrestartTemplate;
  const fields = PRESTART_TEMPLATES[template] ?? [];
  const checkData = prestart.check_data ?? {};

  const checklistRows = useMemo(() => {
    const listed = fields
      .filter((field) => field.type !== "section")
      .map((field) => ({
        label: field.label,
        value: checkData[field.key] != null ? String(checkData[field.key]) : "—",
      }));

    const knownKeys = new Set(fields.map((field) => field.key));
    for (const [key, value] of Object.entries(checkData)) {
      if (knownKeys.has(key)) continue;
      listed.push({ label: key.replace(/_/g, " "), value: String(value ?? "—") });
    }

    return listed;
  }, [checkData, fields]);

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={`${modalClass} max-w-3xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <FormBrandingHeader
            className="mb-0 flex-1 border-0 pb-0"
            title="Plant Pre-Start Report"
            subtitle={unitLabel}
            meta={`${prestart.operator_name} · ${formatTimestamp(prestart.created_at)}`}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-600 text-white shadow-sm hover:bg-red-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className={sectionClass}>
            <p className={labelClass}>Status</p>
            <span
              className={
                prestart.has_defect
                  ? "inline-flex rounded-full border border-orange-200 bg-orange-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-orange-800"
                  : "inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-emerald-800"
              }
            >
              {prestart.has_defect ? "Defect Flagged" : "No Defects"}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className={sectionClass}>
              <p className={labelClass}>Unit number</p>
              <p className="text-sm font-semibold text-slate-900">
                {plantAsset?.unit_number ?? "—"}
              </p>
            </div>
            <div className={sectionClass}>
              <p className={labelClass}>Current hours</p>
              <p className="text-sm font-semibold text-slate-900">
                {formatPrestartHours(prestart.current_reading)}
              </p>
            </div>
            <div className={sectionClass}>
              <p className={labelClass}>Next service due</p>
              <p className="text-sm font-semibold text-slate-900">
                {formatPrestartHours(prestart.next_service_due)}
              </p>
            </div>
          </div>

          {plantAsset ? (
            <div className={sectionClass}>
              <p className={labelClass}>Plant details</p>
              <p className="text-sm text-slate-900">
                {[plantAsset.make, plantAsset.model, plantAsset.category]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Project: {getProjectName(prestart.project_id) ?? "Not set"}
              </p>
            </div>
          ) : null}

          {prestart.has_defect ? (
            <div className={sectionClass}>
              <p className={labelClass}>Defect details</p>
              <p className="text-sm font-semibold text-orange-700">
                {getPrestartDefectLabel(prestart)}
              </p>
              {prestart.defect_comments ? (
                <p className="mt-2 text-sm text-slate-900">{prestart.defect_comments}</p>
              ) : null}
            </div>
          ) : null}

          <div className={sectionClass}>
            <p className={labelClass}>Checklist items</p>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {checklistRows.map((row) => (
                <li
                  key={row.label}
                  className="flex items-start justify-between gap-4 px-3 py-2 text-sm"
                >
                  <span className="text-slate-600">{row.label}</span>
                  <span
                    className={cn(
                      "font-medium",
                      row.value.toLowerCase() === "defect"
                        ? "text-orange-700"
                        : "text-slate-900"
                    )}
                  >
                    {row.value}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {prestart.defect_photo_url ? (
            <div className={sectionClass}>
              <p className={labelClass}>Defect photo</p>
              <div className="relative mt-2 h-48 w-full overflow-hidden rounded-lg border border-slate-200">
                <Image
                  src={prestart.defect_photo_url}
                  alt="Defect photo"
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
            </div>
          ) : null}

          {prestart.signature_url ? (
            <div className={sectionClass}>
              <p className={labelClass}>Operator signature</p>
              <div className="relative mt-2 h-24 w-full overflow-hidden rounded-lg border border-slate-200 bg-white">
                <Image
                  src={prestart.signature_url}
                  alt="Operator signature"
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
            </div>
          ) : null}
        </div>

        {onMarkRead ? (
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              disabled={markingRead}
              onClick={() => void onMarkRead()}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
            >
              {markingRead ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Mark as Read
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
