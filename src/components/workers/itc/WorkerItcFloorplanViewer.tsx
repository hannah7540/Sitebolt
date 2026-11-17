"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  Loader2,
  MapPin,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from "lucide-react";
import WorkerMobileBackButton from "@/components/layout/WorkerMobileBackButton";
import { useMobileBackHandler } from "@/hooks/useMobileBackHandler";
import type { DbProject } from "@/lib/project-resolver";
import {
  fetchWorkerItcPlan,
  fetchWorkerItcRegister,
  type WorkerItcPlanRow,
  type WorkerItcRegisterRow,
} from "@/lib/worker-itc-service";
import WorkerItcPinPreviewModal from "./WorkerItcPinPreviewModal";
import WorkerItcChecklistForm from "./WorkerItcChecklistForm";
import { clampPlanZoom, ITC_PLAN_ZOOM_STEP } from "@/lib/itc-plan-zoom";
import ItcPlanPinMarker from "@/components/itc/ItcPlanPinMarker";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface WorkerItcFloorplanViewerProps {
  workerId: string;
  workerName: string;
  projects: DbProject[];
  defaultProjectId?: string | null;
  onBack?: () => void;
}

export default function WorkerItcFloorplanViewer({
  workerId,
  workerName,
  projects,
  defaultProjectId,
  onBack,
}: WorkerItcFloorplanViewerProps) {
  const [selectedProjectId, setSelectedProjectId] = useState(
    defaultProjectId ?? projects[0]?.id ?? ""
  );
  const [plan, setPlan] = useState<WorkerItcPlanRow | null>(null);
  const [itcs, setItcs] = useState<WorkerItcRegisterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewItcId, setPreviewItcId] = useState<string | null>(null);
  const [checklistItcId, setChecklistItcId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [planImageLoaded, setPlanImageLoaded] = useState(false);
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const scaleRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  scaleRef.current = scale;
  offsetRef.current = offset;

  const loadProjectData = async (projectId: string) => {
    setLoading(true);
    setError(null);
    const [planResult, registerResult] = await Promise.all([
      fetchWorkerItcPlan(projectId),
      fetchWorkerItcRegister(projectId),
    ]);
    setPlan(planResult.plan);
    setItcs(registerResult.itcs);
    setError(planResult.error ?? registerResult.error);
    setLoading(false);
    setPlanImageLoaded(false);
    setScale(1);
    setOffset({ x: 0, y: 0 });
    scaleRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
  };

  useEffect(() => {
    if (!selectedProjectId) {
      setLoading(false);
      return;
    }
    void loadProjectData(selectedProjectId);
  }, [selectedProjectId]);

  const pinnedItcs = useMemo(
    () =>
      itcs.filter((itc) => itc.pin_x != null && itc.pin_y != null),
    [itcs]
  );

  const previewItc = useMemo(
    () => itcs.find((itc) => itc.id === previewItcId) ?? null,
    [itcs, previewItcId]
  );

  const previewSequence = useMemo(() => {
    if (!previewItc) return null;
    const index = itcs.findIndex((itc) => itc.id === previewItc.id);
    return index >= 0 ? index + 1 : null;
  }, [itcs, previewItc]);

  const handleMobileBack = useCallback(() => {
    if (previewItcId) {
      setPreviewItcId(null);
      return true;
    }
    if (onBack) {
      onBack();
      return true;
    }
    return false;
  }, [onBack, previewItcId]);

  useMobileBackHandler(handleMobileBack, !checklistItcId);

  const zoomAtClientPoint = (clientX: number, clientY: number, nextScale: number) => {
    const viewport = viewportRef.current;
    const currentScale = scaleRef.current;
    const clamped = clampPlanZoom(nextScale);
    if (!viewport || clamped === currentScale) {
      setScale(clamped);
      scaleRef.current = clamped;
      return;
    }
    const rect = viewport.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const ratio = clamped / currentScale;
    const currentOffset = offsetRef.current;
    const nextOffset = {
      x: mx - centerX - (mx - centerX - currentOffset.x) * ratio,
      y: my - centerY - (my - centerY - currentOffset.y) * ratio,
    };
    scaleRef.current = clamped;
    offsetRef.current = nextOffset;
    setScale(clamped);
    setOffset(nextOffset);
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !plan) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaY > 0 ? -ITC_PLAN_ZOOM_STEP : ITC_PLAN_ZOOM_STEP;
      zoomAtClientPoint(event.clientX, event.clientY, scaleRef.current + delta);
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [plan]);

  const handlePointerDown: React.PointerEventHandler<HTMLDivElement> = (event) => {
    if ((event.target as HTMLElement).closest("[data-itc-pin]")) return;
    dragRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove: React.PointerEventHandler<HTMLDivElement> = (event) => {
    if (!dragRef.current?.active) return;
    const nextOffset = {
      x: dragRef.current.originX + (event.clientX - dragRef.current.startX),
      y: dragRef.current.originY + (event.clientY - dragRef.current.startY),
    };
    offsetRef.current = nextOffset;
    setOffset(nextOffset);
  };

  const handlePointerUp: React.PointerEventHandler<HTMLDivElement> = (event) => {
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const navigatePreview = (direction: -1 | 1) => {
    if (!previewItc) return;
    const index = itcs.findIndex((itc) => itc.id === previewItc.id);
    const next = itcs[index + direction];
    if (next) setPreviewItcId(next.id);
  };

  const selectedProject = projects.find((project) => project.id === selectedProjectId);

  if (checklistItcId) {
    return (
      <WorkerItcChecklistForm
        itcId={checklistItcId}
        projectId={selectedProjectId}
        workerId={workerId}
        workerName={workerName}
        projectName={selectedProject?.name}
        onClose={() => {
          setChecklistItcId(null);
          void loadProjectData(selectedProjectId);
        }}
        onCompleted={() => {
          setChecklistItcId(null);
          setPreviewItcId(null);
          void loadProjectData(selectedProjectId);
        }}
      />
    );
  }

  return (
    <div className="space-y-4 worker-mobile-content-pad lg:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="mb-2 hidden items-center gap-1 text-sm font-semibold text-orange-600 hover:text-orange-700 lg:inline-flex"
            >
              <ChevronLeft className="h-4 w-4" />
              Back to dashboard
            </button>
          ) : null}
          <h1 className="text-2xl font-bold text-slate-900">
            ITC&apos;s <span className="text-orange-500">Floorplan</span>
          </h1>
          <p className="text-sm text-slate-500">
            Tap a pin to preview an ITC, then add checklist progress collaboratively.
          </p>
        </div>
        <Link
          href={
            selectedProjectId
              ? `/worker-dashboard/itc/redline?worker_id=${encodeURIComponent(workerId)}&project_id=${encodeURIComponent(selectedProjectId)}`
              : `/worker-dashboard/itc/redline?worker_id=${encodeURIComponent(workerId)}`
          }
          className="inline-flex items-center justify-center rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-500"
        >
          Red line markup
        </Link>
      </div>

      <div className={cn(cardClass, "p-4")}>
        <label className={labelClass}>Job / Project</label>
        <select
          value={selectedProjectId}
          onChange={(event) => setSelectedProjectId(event.target.value)}
          className={inputClass}
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        {selectedProject ? (
          <p className="mt-1 text-xs text-slate-500">
            {pinnedItcs.length} pinned ITC{pinnedItcs.length === 1 ? "" : "s"} on this plan
          </p>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
          Loading floorplan…
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : !plan ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center">
          <MapPin className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-700">
            No floorplan uploaded for this job yet.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Ask your site administrator to upload a plan in the ITP &amp; ITC module.
          </p>
        </div>
      ) : (
        <div className={cn(cardClass, "overflow-hidden")}>
          <div className="relative h-[min(75vh,640px)] w-full">
            <div className="absolute left-3 top-3 z-20 max-w-[60%] rounded-lg bg-white/90 px-3 py-2 shadow-sm ring-1 ring-slate-200 backdrop-blur">
              <p className="truncate text-sm font-semibold text-slate-900">{plan.plan_name}</p>
              <p className="truncate text-xs text-slate-500">{selectedProject?.name}</p>
            </div>
            <div className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-lg bg-white/90 p-1 shadow-sm ring-1 ring-slate-200 backdrop-blur">
              <button
                type="button"
                onClick={() => {
                  const viewport = viewportRef.current;
                  if (!viewport) {
                    setScale((current) => clampPlanZoom(current - ITC_PLAN_ZOOM_STEP));
                    return;
                  }
                  const rect = viewport.getBoundingClientRect();
                  zoomAtClientPoint(
                    rect.left + rect.width / 2,
                    rect.top + rect.height / 2,
                    scaleRef.current - ITC_PLAN_ZOOM_STEP
                  );
                }}
                className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
                aria-label="Zoom out"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const viewport = viewportRef.current;
                  if (!viewport) {
                    setScale((current) => clampPlanZoom(current + ITC_PLAN_ZOOM_STEP));
                    return;
                  }
                  const rect = viewport.getBoundingClientRect();
                  zoomAtClientPoint(
                    rect.left + rect.width / 2,
                    rect.top + rect.height / 2,
                    scaleRef.current + ITC_PLAN_ZOOM_STEP
                  );
                }}
                className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
                aria-label="Zoom in"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  scaleRef.current = 1;
                  offsetRef.current = { x: 0, y: 0 };
                  setScale(1);
                  setOffset({ x: 0, y: 0 });
                }}
                className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
                aria-label="Reset zoom"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>

            <div
              ref={viewportRef}
              className="relative h-full w-full cursor-grab touch-none select-none overflow-hidden bg-slate-100 active:cursor-grabbing"
              style={{ userSelect: "none" }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              {!planImageLoaded ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100/90">
                  <div className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200">
                    <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                    Loading plan…
                  </div>
                </div>
              ) : null}
              <div
                className="absolute left-1/2 top-1/2 origin-center will-change-transform"
                style={{
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
                }}
              >
                <div className="relative inline-block select-none">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={plan.image_url}
                    alt={plan.plan_name}
                    decoding="async"
                    loading="eager"
                    onLoad={() => setPlanImageLoaded(true)}
                    onError={() => setPlanImageLoaded(true)}
                    className="pointer-events-none block h-auto max-h-[min(70vh,640px)] w-auto max-w-none select-none object-contain"
                    draggable={false}
                  />
                  {pinnedItcs.map((itc, index) => (
                    <ItcPlanPinMarker
                      key={itc.id}
                      x={itc.pin_x ?? 0.5}
                      y={itc.pin_y ?? 0.5}
                      label={String(index + 1)}
                      selected={previewItcId === itc.id}
                      colorClass={
                        itc.status === "completed" || itc.status === "complete"
                          ? "text-emerald-500"
                          : itc.status === "in_progress"
                            ? "text-amber-500"
                            : "text-slate-500"
                      }
                      onClick={() => setPreviewItcId(itc.id)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 px-4 py-3 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-400" /> Not Started
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> In Progress
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Completed
            </span>
          </div>
        </div>
      )}

      {previewItc && previewSequence ? (
        <WorkerItcPinPreviewModal
          itc={previewItc}
          sequence={previewSequence}
          canGoPrevious={itcs.findIndex((row) => row.id === previewItc.id) > 0}
          canGoNext={
            itcs.findIndex((row) => row.id === previewItc.id) < itcs.length - 1
          }
          onPrevious={() => navigatePreview(-1)}
          onNext={() => navigatePreview(1)}
          onClose={() => setPreviewItcId(null)}
          onAddToItc={() => {
            setChecklistItcId(previewItc.id);
            setPreviewItcId(null);
          }}
        />
      ) : null}

      {onBack ? (
        <WorkerMobileBackButton label="Back to dashboard" onClick={onBack} />
      ) : null}
    </div>
  );
}
