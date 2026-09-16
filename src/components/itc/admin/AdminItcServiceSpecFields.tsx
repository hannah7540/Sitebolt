"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ADMIN_PIPE_MATERIALS,
  ADMIN_PIPE_SERVICES,
  ADMIN_PIPE_SIZES,
  type AdminItcSpecValues,
} from "@/components/itc/admin/itp-itc-admin-types";
import { lookupAdminItcSpecs } from "@/components/itc/admin/itp-itc-admin-specs";
import { inputClass } from "@/lib/ui-classes";

interface AdminItcServiceSpecFieldsProps {
  pipeSize: string;
  pipeMaterial: string;
  templateKey?: string | null;
  specValues: AdminItcSpecValues | null;
  onPipeSizeChange: (value: string) => void;
  onPipeMaterialChange: (value: string) => void;
  onSpecValuesChange: (value: AdminItcSpecValues | null) => void;
}

function specServiceKey(size: string, material: string): string {
  const match = ADMIN_PIPE_SERVICES.find(
    (row) => row.size === size && row.material === material
  );
  return match ? `${match.size}|${match.material}` : size && material ? "custom" : "";
}

function specDisplay(value: number | null | undefined, suffix = " mm"): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value}${suffix}`;
}

export default function AdminItcServiceSpecFields({
  pipeSize,
  pipeMaterial,
  templateKey,
  specValues,
  onPipeSizeChange,
  onPipeMaterialChange,
  onSpecValuesChange,
}: AdminItcServiceSpecFieldsProps) {
  const [lookingUp, setLookingUp] = useState(false);
  const lookupKey = `${pipeSize}|${pipeMaterial}|${templateKey ?? ""}`;
  const lastLookupKey = useRef("");
  const serviceKey = specServiceKey(pipeSize, pipeMaterial);
  const sizeOptions = useMemo(() => {
    const extra = pipeSize && !ADMIN_PIPE_SIZES.includes(pipeSize as (typeof ADMIN_PIPE_SIZES)[number]);
    return extra ? [pipeSize, ...ADMIN_PIPE_SIZES] : [...ADMIN_PIPE_SIZES];
  }, [pipeSize]);
  const materialOptions = useMemo(() => {
    const extra =
      pipeMaterial &&
      !ADMIN_PIPE_MATERIALS.includes(pipeMaterial as (typeof ADMIN_PIPE_MATERIALS)[number]);
    return extra ? [pipeMaterial, ...ADMIN_PIPE_MATERIALS] : [...ADMIN_PIPE_MATERIALS];
  }, [pipeMaterial]);

  useEffect(() => {
    if (!pipeSize && !pipeMaterial) return;
    const lockedToSelection =
      specValues?.pipe_size === pipeSize &&
      specValues?.pipe_material === pipeMaterial &&
      (specValues.min_bedding_mm != null ||
        specValues.min_side_clearance_mm != null ||
        specValues.joint_gap_range != null);
    if (lockedToSelection) {
      lastLookupKey.current = lookupKey;
      return;
    }
    if (lastLookupKey.current === lookupKey) return;
    lastLookupKey.current = lookupKey;
    let cancelled = false;
    setLookingUp(true);
    void lookupAdminItcSpecs({
      pipeSize,
      pipeMaterial,
      templateKey,
    }).then((next) => {
      if (cancelled) return;
      setLookingUp(false);
      onSpecValuesChange(next);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupKey, pipeSize, pipeMaterial, templateKey]);

  return (
    <div className="space-y-3">
      <label>
        <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
          Pipe size / Service
        </span>
        <select
          value={serviceKey === "custom" ? "custom" : serviceKey}
          onChange={(event) => {
            const value = event.target.value;
            if (!value || value === "custom") return;
            const [size, material] = value.split("|");
            onPipeSizeChange(size ?? "");
            onPipeMaterialChange(material ?? "");
          }}
          className={inputClass}
        >
          <option value="">Select size / service</option>
          {ADMIN_PIPE_SERVICES.map((row) => (
            <option key={`${row.size}|${row.material}`} value={`${row.size}|${row.material}`}>
              {row.label}
            </option>
          ))}
          <option value="custom">Custom size / material</option>
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
            Pipe size
          </span>
          <select
            value={pipeSize}
            onChange={(event) => onPipeSizeChange(event.target.value)}
            className={inputClass}
          >
            <option value="">Select size</option>
            {sizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
            Pipe material
          </span>
          <select
            value={pipeMaterial}
            onChange={(event) => onPipeMaterialChange(event.target.value)}
            className={inputClass}
          >
            <option value="">Select material</option>
            {materialOptions.map((material) => (
              <option key={material} value={material}>
                {material}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Auto-filled header specs
          </p>
          <span className="text-[11px] text-slate-500">
            {lookingUp
              ? "Looking up…"
              : specValues?.source_table
                ? `Locked from ${specValues.source_table}`
                : "No spec match"}
          </span>
        </div>
        <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-[11px] font-semibold uppercase text-slate-500">Min bedding</dt>
            <dd className="font-semibold text-slate-900">
              {specDisplay(specValues?.min_bedding_mm)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase text-slate-500">Min overlay</dt>
            <dd className="font-semibold text-slate-900">
              {specDisplay(specValues?.min_overlay_mm)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase text-slate-500">
              Min side clearance
            </dt>
            <dd className="font-semibold text-slate-900">
              {specDisplay(specValues?.min_side_clearance_mm)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase text-slate-500">Trench width</dt>
            <dd className="font-semibold text-slate-900">
              {specDisplay(specValues?.trench_width_mm)}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[11px] font-semibold uppercase text-slate-500">
              Joint gap range
            </dt>
            <dd className="font-semibold text-slate-900">
              {specValues?.joint_gap_range || "—"}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
