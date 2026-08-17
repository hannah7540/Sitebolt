"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from "lucide-react";
import type { DbProject } from "@/lib/project-resolver";
import {
  fetchWorkerItcPlan,
  fetchWorkerItcRegister,
  getWorkerItcPinColor,
  getWorkerItcStatusLabel,
  type WorkerItcPlanRow,
  type WorkerItcRegisterRow,
} from "@/lib/worker-itc-service";
import WorkerItcPinPreviewModal from "./WorkerItcPinPreviewModal";
import WorkerItcChecklistForm from "./WorkerItcChecklistForm";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface WorkerItcFloorplanViewerProps {
  workerId: string;
  workerName: string;
  projects: DbProject[];
  defaultProjectId?: string | null;
  onBack?: () => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

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
    setScale(1);
    setOffset({ x: 0, y: 0 });
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

  const handleWheel: React.WheelEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    setScale((current) => clamp(current + delta, 0.5, 4));
  };

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
    setOffset({
      x: dragRef.current.originX + (event.clientX - dragRef.current.startX),
      y: dragRef.current.originY + (event.clientY - dragRef.current.startY),
    });
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-orange-600 hover:text-orange-700"
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
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">{plan.plan_name}</p>
              <p className="text-xs text-slate-500">{selectedProject?.name}</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setScale((current) => clamp(current - 0.2, 0.5, 4))}
                className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                aria-label="Zoom out"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setScale((current) => clamp(current + 0.2, 0.5, 4))}
                className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                aria-label="Zoom in"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setScale(1);
                  setOffset({ x: 0, y: 0 });
                }}
                className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                aria-label="Reset zoom"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div
            ref={viewportRef}
            className="relative h-[min(70vh,520px)] cursor-grab overflow-hidden bg-slate-100 active:cursor-grabbing"
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <div
              className="absolute left-1/2 top-1/2 origin-center"
              style={{
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
              }}
            >
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={plan.image_url}
                  alt={plan.plan_name}
                  className="max-h-[480px] max-w-[min(92vw,880px)] select-none object-contain"
                  draggable={false}
                />
                {pinnedItcs.map((itc, index) => (
                  <button
                    key={itc.id}
                    type="button"
                    data-itc-pin
                    title={itc.itc_number}
                    onClick={() => setPreviewItcId(itc.id)}
                    className={cn(
                      "absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow-md transition hover:scale-110",
                      getWorkerItcPinColor(itc.status),
                      previewItcId === itc.id && "ring-4 ring-orange-300"
                    )}
                    style={{
                      left: `${(itc.pin_x ?? 0.5) * 100}%`,
                      top: `${(itc.pin_y ?? 0.5) * 100}%`,
                    }}
                  >
                    #{index + 1}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
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
    </div>
  );
}
