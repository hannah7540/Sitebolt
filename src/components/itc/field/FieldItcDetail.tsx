"use client";

import {
  fieldItcStatusChip,
  serviceChipColor,
  type FieldItcRecord,
  type FieldItcSignoff,
  type FieldProgressLog,
  FIELD_ITC_FORM_STEPS,
} from "@/lib/api/itc";
import FieldItcSignoffCard from "@/components/itc/field/FieldItcSignoff";
import { cardClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface FieldItcDetailProps {
  projectId: string;
  itc: FieldItcRecord;
  signoffs: FieldItcSignoff[];
  progress: FieldProgressLog[];
  workerId: string;
  workerName: string;
  roverOptions: string[];
  operatorOptions: string[];
  onSigned: () => void;
}

export default function FieldItcDetail({
  projectId,
  itc,
  signoffs,
  progress,
  workerId,
  workerName,
  roverOptions,
  operatorOptions,
  onSigned,
}: FieldItcDetailProps) {
  const chip = fieldItcStatusChip(itc.status);
  const serviceColor = serviceChipColor(itc.service_code ?? itc.service_name);
  const signedSteps = new Set(signoffs.map((row) => row.step_index));

  return (
    <div className="space-y-4">
      <div className={`${cardClass} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
              Inspection Test Certificate
            </p>
            <h2 className="text-xl font-semibold text-slate-900">{itc.itc_number}</h2>
            <p className="text-sm text-slate-500">
              {itc.start_location ?? "—"} → {itc.end_location ?? "—"}
            </p>
          </div>
          <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", chip.bg, chip.text)}>
            {chip.label}
          </span>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs uppercase text-slate-500">Zone</dt>
            <dd>
              {itc.zone_code ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                  {itc.zone_code}
                </span>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Building</dt>
            <dd>
              {itc.building ? (
                <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800">
                  {itc.building}
                </span>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Service</dt>
            <dd>
              {itc.service_name ? (
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                  style={{ backgroundColor: serviceColor }}
                >
                  {itc.service_name}
                </span>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Length</dt>
            <dd>{itc.length_m != null ? `${itc.length_m} m` : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Material / size</dt>
            <dd>{itc.material_and_size ?? itc.conduits_label}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Drawing rev</dt>
            <dd>{itc.drawing_rev ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Progress</dt>
            <dd>{itc.progress_percent}%</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">GPS</dt>
            <dd>
              {itc.gps_lat != null && itc.gps_lng != null
                ? `${itc.gps_lat.toFixed(5)}, ${itc.gps_lng.toFixed(5)}`
                : "—"}
            </dd>
          </div>
        </dl>
      </div>

      <div className="flex flex-wrap gap-1">
        {FIELD_ITC_FORM_STEPS.map((step) => (
          <span
            key={step.step_key}
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
              signedSteps.has(step.step_index)
                ? "bg-emerald-100 text-emerald-800"
                : "bg-slate-100 text-slate-600"
            )}
            title={step.title}
          >
            {step.step_index + 1}
          </span>
        ))}
      </div>

      {progress.length ? (
        <div className={`${cardClass} p-4`}>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Progress log</h3>
          <ul className="space-y-1 text-sm text-slate-600">
            {progress.map((row) => (
              <li key={row.id}>
                {row.log_date.slice(0, 10)} · {row.chainage_m ?? "—"} m
                {row.author_name ? ` · ${row.author_name}` : ""}
                {row.notes ? ` — ${row.notes}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-3">
        {FIELD_ITC_FORM_STEPS.map((step) => (
          <FieldItcSignoffCard
            key={step.step_key}
            projectId={projectId}
            itc={itc}
            step={step}
            signoffs={signoffs}
            workerId={workerId}
            workerName={workerName}
            roverOptions={roverOptions}
            operatorOptions={operatorOptions}
            onSigned={onSigned}
          />
        ))}
      </div>
    </div>
  );
}
