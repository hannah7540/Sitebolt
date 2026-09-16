"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Loader2, MapPin, Plus } from "lucide-react";
import FieldItcCreateModal from "@/components/itc/field/FieldItcCreateModal";
import {
  FIELD_ITC_STATUS_COLORS,
  SITE_PLAN_FALLBACK_URL,
  listCompactionTests,
  listDrawings,
  listFormVersions,
  serviceChipColor,
  type FieldDrawing,
  type FieldFormVersion,
  type FieldItcListResult,
  type FieldItcRecord,
} from "@/lib/api/itc";
import { getRelativeCanvasCoordinates } from "@/lib/itc-drawing-upload";
import type { ItcCompactionTest } from "@/lib/itc-compaction-service";
import { cardClass, inputClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

const SITE_PLAN_SVG_FALLBACK = "/assets/site-plan.svg";

interface FieldItcPlanViewProps {
  projectId: string;
  data: FieldItcListResult;
  selectedId: string | null;
  onSelect: (itc: FieldItcRecord) => void;
  onCreated: (itc: FieldItcRecord) => void;
}

export default function FieldItcPlanView({
  projectId,
  data,
  selectedId,
  onSelect,
  onCreated,
}: FieldItcPlanViewProps) {
  const planRef = useRef<HTMLDivElement>(null);
  const [drawings, setDrawings] = useState<FieldDrawing[]>([]);
  const [formVersions, setFormVersions] = useState<FieldFormVersion[]>([]);
  const [tests, setTests] = useState<ItcCompactionTest[]>([]);
  const [drawingId, setDrawingId] = useState("");
  const [serviceId, setServiceId] = useState(data.services[0]?.id ?? "");
  const [formVersionId, setFormVersionId] = useState("");
  const [dropMode, setDropMode] = useState(false);
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null);
  const [planSrc, setPlanSrc] = useState(SITE_PLAN_FALLBACK_URL);
  const [loading, setLoading] = useState(true);

  const loadContext = useCallback(async () => {
    setLoading(true);
    const [nextDrawings, nextVersions, nextTests] = await Promise.all([
      listDrawings(projectId),
      listFormVersions(),
      listCompactionTests(projectId),
    ]);
    setDrawings(nextDrawings);
    setFormVersions(nextVersions);
    setTests(nextTests);
    const currentForm = nextVersions.find((row) => row.is_current) ?? nextVersions[0];
    setFormVersionId((current) => current || currentForm?.id || "");
    const firstWithImage = nextDrawings.find((row) => row.image_url) ?? nextDrawings[0];
    setDrawingId((current) => current || firstWithImage?.id || "");
    setPlanSrc(firstWithImage?.image_url || SITE_PLAN_FALLBACK_URL);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  useEffect(() => {
    if (!serviceId && data.services[0]?.id) setServiceId(data.services[0].id);
  }, [data.services, serviceId]);

  const selectedDrawing = drawings.find((row) => row.id === drawingId) ?? null;

  useEffect(() => {
    if (selectedDrawing?.image_url) {
      setPlanSrc(selectedDrawing.image_url);
    }
  }, [selectedDrawing]);

  const visibleItcs = useMemo(
    () => data.itcs.filter((itc) => itc.pin_x != null && itc.pin_y != null),
    [data.itcs]
  );

  const handlePlanClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!dropMode || !planRef.current) return;
    const coords = getRelativeCanvasCoordinates(
      event.clientX,
      event.clientY,
      planRef.current
    );
    setPendingPin(coords);
    setDropMode(false);
  };

  return (
    <div className="space-y-4">
      <div className={`${cardClass} p-4`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Plan</h2>
            <p className="text-xs text-slate-500">
              Drop a pin to create an ITC under the active service / drawing / form version.
              Click an existing pin to open that certificate.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDropMode((current) => !current)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold",
              dropMode ? "bg-orange-500 text-white" : "bg-slate-900 text-white"
            )}
          >
            <Plus className="h-4 w-4" />
            {dropMode ? "Click plan to drop pin" : "+ Drop Pin to Create ITC"}
          </button>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label>
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Drawing / ITP sheet
            </span>
            <select
              value={drawingId}
              onChange={(event) => setDrawingId(event.target.value)}
              className={inputClass}
            >
              {drawings.length === 0 ? <option value="">Fallback site plan</option> : null}
              {drawings.map((drawing) => (
                <option key={drawing.id} value={drawing.id}>
                  {drawing.title}
                  {drawing.current_rev ? ` · ${drawing.current_rev}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Active service
            </span>
            <select
              value={serviceId}
              onChange={(event) => setServiceId(event.target.value)}
              className={inputClass}
            >
              {data.services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </label>
          {formVersions.length ? (
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Form version
              </span>
              <select
                value={formVersionId}
                onChange={(event) => setFormVersionId(event.target.value)}
                className={inputClass}
              >
                {formVersions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.name}
                    {version.is_current ? " (current)" : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>

      <div className={`${cardClass} overflow-hidden`}>
        {loading ? (
          <div className="flex items-center gap-2 px-4 py-10 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
            Loading plan…
          </div>
        ) : (
          <div
            ref={planRef}
            onClick={handlePlanClick}
            className={cn(
              "relative aspect-[16/9] min-h-[280px] bg-slate-100",
              dropMode && "cursor-crosshair"
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={planSrc}
              alt="Site plan"
              className="h-full w-full object-contain"
              onError={() => {
                if (planSrc !== SITE_PLAN_SVG_FALLBACK) {
                  setPlanSrc(SITE_PLAN_SVG_FALLBACK);
                }
              }}
            />

            {data.zones.map((zone) =>
              zone.pin_x == null || zone.pin_y == null ? null : (
                <span
                  key={`zone-${zone.id}`}
                  title={`Zone ${zone.name}`}
                  className="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow"
                  style={{ left: `${zone.pin_x * 100}%`, top: `${zone.pin_y * 100}%` }}
                >
                  {zone.code}
                </span>
              )
            )}

            {tests.map((test) =>
              test.mark_x == null || test.mark_y == null ? null : (
                <span
                  key={`test-${test.id}`}
                  title={`Compaction ${test.test_number}`}
                  className="absolute z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-white bg-violet-500 shadow"
                  style={{ left: `${test.mark_x * 100}%`, top: `${test.mark_y * 100}%` }}
                />
              )
            )}

            {visibleItcs.map((itc) => {
              const colors = FIELD_ITC_STATUS_COLORS[itc.status];
              const serviceColor = serviceChipColor(itc.service_code ?? itc.service_name);
              return (
                <button
                  key={itc.id}
                  type="button"
                  title={`${itc.itc_number} — ${itc.start_location ?? "—"} → ${itc.end_location ?? "—"}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(itc);
                  }}
                  className={cn(
                    "absolute z-20 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md transition hover:scale-125",
                    colors.bg.replace("bg-", "bg-"),
                    selectedId === itc.id && "ring-4 ring-orange-300"
                  )}
                  style={{
                    left: `${Number(itc.pin_x) * 100}%`,
                    top: `${Number(itc.pin_y) * 100}%`,
                    backgroundColor: serviceColor,
                  }}
                />
              );
            })}

            {dropMode ? (
              <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
                <span className="inline-flex items-center gap-1 rounded-full bg-orange-500 px-3 py-1 text-xs font-semibold text-white shadow">
                  <MapPin className="h-3.5 w-3.5" />
                  Click the plan to place a new ITC
                </span>
              </div>
            ) : null}
          </div>
        )}
        <div className="flex flex-wrap gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-400" /> ITC pin
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded-full bg-sky-600 px-1 text-[9px] font-bold text-white">Z</span>{" "}
            Zone
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rotate-45 bg-violet-500" /> Compaction test
          </span>
        </div>
      </div>

      {pendingPin ? (
        <FieldItcCreateModal
          projectId={projectId}
          pinX={pendingPin.x}
          pinY={pendingPin.y}
          planUrl={planSrc}
          data={data}
          drawings={drawings}
          formVersions={formVersions}
          activeServiceId={serviceId}
          activeDrawingId={drawingId}
          activeFormVersionId={formVersionId}
          onClose={() => setPendingPin(null)}
          onCreated={(itc) => {
            setPendingPin(null);
            onCreated(itc);
          }}
        />
      ) : null}
    </div>
  );
}
