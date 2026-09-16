"use client";

import { useMemo, useState, type DragEvent } from "react";
import { Loader2, Upload } from "lucide-react";
import ItpItcPlanCanvas from "@/components/itc/admin/ItpItcPlanCanvas";
import {
  createAdminItcFromPin,
  createAdminItp,
  uploadItpPlan,
  type AdminItcRecord,
  type AdminItpRecord,
} from "@/components/itc/admin/itp-itc-admin-api";
import {
  ADMIN_ITP_TEMPLATES,
  ADMIN_PIPE_MATERIALS,
  ADMIN_PIPE_SIZES,
  DEFAULT_ITC_CLIENT,
  DEFAULT_MANAGING_CONTRACTOR,
  DEFAULT_SUBCONTRACTOR,
  getAdminItpTemplate,
} from "@/components/itc/admin/itp-itc-admin-types";
import { cardClass, inputClass, modalClass, modalOverlayClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface ItpItcCreateWizardProps {
  projects: Array<{ id: string; name: string }>;
  onCreated: (itp: AdminItpRecord) => void;
}

interface PinDraft {
  x: number;
  y: number;
}

export default function ItpItcCreateWizard({ projects, onCreated }: ItpItcCreateWizardProps) {
  const [step, setStep] = useState(1);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [area, setArea] = useState("");
  const [client, setClient] = useState(DEFAULT_ITC_CLIENT);
  const [managingContractor, setManagingContractor] = useState(DEFAULT_MANAGING_CONTRACTOR);
  const [subcontractor, setSubcontractor] = useState(DEFAULT_SUBCONTRACTOR);
  const [drawingRef, setDrawingRef] = useState("");
  const [planFile, setPlanFile] = useState<File | null>(null);
  const [planUrl, setPlanUrl] = useState<string | null>(null);
  const [planPreview, setPlanPreview] = useState<string | null>(null);
  const [templateKey, setTemplateKey] = useState<string>(ADMIN_ITP_TEMPLATES[0]?.key ?? "");
  const [createdItp, setCreatedItp] = useState<AdminItpRecord | null>(null);
  const [pins, setPins] = useState<AdminItcRecord[]>([]);
  const [pendingPin, setPendingPin] = useState<PinDraft | null>(null);
  const [runNumber, setRunNumber] = useState("");
  const [pipeSize, setPipeSize] = useState("100mm");
  const [pipeMaterial, setPipeMaterial] = useState("PVC");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const template = getAdminItpTemplate(templateKey);

  const canvasPins = useMemo(
    () =>
      pins
        .filter((row) => row.pin_x != null && row.pin_y != null)
        .map((row, index) => ({
          id: row.id,
          x: row.pin_x as number,
          y: row.pin_y as number,
          number: index + 1,
          label: row.run_number || row.number,
        })),
    [pins]
  );

  const acceptPlan = async (file: File) => {
    const allowed = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];
    if (!allowed.includes(file.type) && !/\.(pdf|png|jpe?g)$/i.test(file.name)) {
      setMessage("Upload a PDF, PNG, or JPG plan drawing.");
      return;
    }
    setBusy(true);
    setMessage(null);
    setPlanFile(file);
    const uploaded = await uploadItpPlan({
      projectId: projectId || "unassigned",
      file,
    });
    setBusy(false);
    setPlanUrl(uploaded.url);
    setPlanPreview(uploaded.preview);
    if (uploaded.error && !uploaded.url && !uploaded.preview) {
      setMessage(uploaded.error);
    }
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void acceptPlan(file);
  };

  const goStep2 = () => {
    setMessage(null);
    if (!projectId) {
      setMessage("Select a project.");
      return;
    }
    if (!area.trim()) {
      setMessage("Enter an area / location.");
      return;
    }
    if (!planPreview && !planUrl) {
      setMessage("Upload a site or floor plan before continuing.");
      return;
    }
    setStep(2);
  };

  const goStep3 = async () => {
    setMessage(null);
    if (!template) {
      setMessage("Select an ITP template.");
      return;
    }
    if (createdItp) {
      setStep(3);
      return;
    }
    setBusy(true);
    const result = await createAdminItp({
      projectId,
      area: area.trim(),
      client: client.trim(),
      managingContractor: managingContractor.trim(),
      subcontractor: subcontractor.trim(),
      drawingRef: drawingRef.trim(),
      planUrl,
      templateKey,
      title: template.title,
    });
    setBusy(false);
    if (result.error || !result.itp) {
      setMessage(result.error ?? "Failed to create ITP");
      return;
    }
    setCreatedItp(result.itp);
    setStep(3);
  };

  const savePin = async () => {
    if (!createdItp || !pendingPin) return;
    if (!runNumber.trim()) {
      setMessage("Enter a run / line number.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await createAdminItcFromPin({
      projectId,
      itp: createdItp,
      pinX: pendingPin.x,
      pinY: pendingPin.y,
      runNumber: runNumber.trim(),
      pipeSize,
      pipeMaterial,
    });
    setBusy(false);
    if (result.error || !result.itc) {
      setMessage(result.error ?? "Failed to save ITC pin");
      return;
    }
    setPins((current) => [...current, result.itc!]);
    setPendingPin(null);
    setRunNumber("");
  };

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-2 text-sm">
        {[
          "1. Project, Area & Plan",
          "2. ITP Template",
          "3. Pin-drop ITCs",
        ].map((label, index) => (
          <li
            key={label}
            className={cn(
              "rounded-full px-3 py-1.5 font-semibold",
              step === index + 1
                ? "bg-orange-500 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200"
            )}
          >
            {label}
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <div className={`${cardClass} space-y-4 p-5`}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Project
              </span>
              <select
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                className={inputClass}
              >
                {projects.length === 0 ? <option value="">No projects</option> : null}
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Area / Location
              </span>
              <input
                value={area}
                onChange={(event) => setArea(event.target.value)}
                placeholder='e.g. "MP2", "WP7", "Level 4 Pour 3"'
                className={inputClass}
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Client
              </span>
              <input
                value={client}
                onChange={(event) => setClient(event.target.value)}
                className={inputClass}
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Managing contractor
              </span>
              <input
                value={managingContractor}
                onChange={(event) => setManagingContractor(event.target.value)}
                className={inputClass}
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Subcontractor
              </span>
              <input
                value={subcontractor}
                onChange={(event) => setSubcontractor(event.target.value)}
                className={inputClass}
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Drawing ref & rev
              </span>
              <input
                value={drawingRef}
                onChange={(event) => setDrawingRef(event.target.value)}
                placeholder='e.g. "C0604 Rev B"'
                className={inputClass}
              />
            </label>
          </div>
          <label
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={cn(
              "flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center",
              dragOver ? "border-orange-500 bg-orange-50" : "border-slate-300 bg-slate-50"
            )}
          >
            <Upload className="mb-2 h-6 w-6 text-orange-500" />
            <span className="text-sm font-semibold text-slate-800">
              Drop PDF or high-res PNG/JPG plan
            </span>
            <span className="text-xs text-slate-500">
              {planFile ? planFile.name : "Uploads to the itp-plans bucket"}
            </span>
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void acceptPlan(file);
              }}
            />
          </label>
          {planPreview && !planPreview.startsWith("data:application/pdf") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={planPreview} alt="Plan preview" className="max-h-48 rounded-lg border" />
          ) : null}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={goStep2}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className={`${cardClass} space-y-4 p-5`}>
          <label>
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Built-in A Plus Plumbing template
            </span>
            <select
              value={templateKey}
              onChange={(event) => setTemplateKey(event.target.value)}
              className={inputClass}
            >
              {ADMIN_ITP_TEMPLATES.map((row) => (
                <option key={row.key} value={row.key}>
                  {row.title}
                </option>
              ))}
            </select>
          </label>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Checklist questions</h3>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
              {template?.questions.map((question) => (
                <li key={question.key}>{question.text}</li>
              ))}
            </ol>
          </div>
          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => void goStep3()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create ITP & drop pins
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className={`${cardClass} space-y-4 p-5`}>
          <p className="text-sm text-slate-600">
            Click the plan to drop a numbered pin. Each pin becomes an ITC linked to{" "}
            <span className="font-semibold">{createdItp?.number}</span>.
          </p>
          <ItpItcPlanCanvas
            planUrl={planUrl}
            planPreview={planPreview}
            mimeType={planFile?.type}
            pins={canvasPins}
            dropEnabled
            onDrop={(x, y) => {
              setPendingPin({ x, y });
              setMessage(null);
            }}
          />
          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => createdItp && onCreated(createdItp)}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Finish
            </button>
          </div>
        </div>
      ) : null}

      {message ? <p className="text-sm text-rose-600">{message}</p> : null}

      {pendingPin ? (
        <div className={modalOverlayClass} onClick={() => setPendingPin(null)}>
          <div className={`${modalClass} max-w-lg`} onClick={(event) => event.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">Define this run</h3>
            <p className="mb-4 text-sm text-slate-500">
              Pin at {(pendingPin.x * 100).toFixed(1)}% × {(pendingPin.y * 100).toFixed(1)}%
            </p>
            <div className="space-y-3">
              <label>
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                  Run / Line number
                </span>
                <input
                  value={runNumber}
                  onChange={(event) => setRunNumber(event.target.value)}
                  placeholder='e.g. "SW11-01 to SW11-02", "Pit 07-04", or "Stack 1"'
                  className={inputClass}
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                  Pipe size
                </span>
                <select
                  value={pipeSize}
                  onChange={(event) => setPipeSize(event.target.value)}
                  className={inputClass}
                >
                  {ADMIN_PIPE_SIZES.map((size) => (
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
                  onChange={(event) => setPipeMaterial(event.target.value)}
                  className={inputClass}
                >
                  {ADMIN_PIPE_MATERIALS.map((material) => (
                    <option key={material} value={material}>
                      {material}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-slate-500">
                  Checklist from template
                </p>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
                  {template?.questions.map((question) => (
                    <li key={question.key}>{question.text}</li>
                  ))}
                </ol>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingPin(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void savePin()}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save ITC pin
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
