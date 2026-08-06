"use client";

import type { ItcCompletedDocument } from "@/lib/itc-batch-templates";
import { cardClass } from "@/lib/ui-classes";

interface ItcCompletedPrintViewProps {
  document: ItcCompletedDocument;
  projectName: string;
}

export default function ItcCompletedPrintView({
  document,
  projectName,
}: ItcCompletedPrintViewProps) {
  return (
    <div className={`${cardClass} print:border-0 print:shadow-none`}>
      <div className="border-b border-slate-200 px-4 py-3 print:hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">{document.itc_number}</h3>
            <p className="text-xs text-slate-500">Completed ITC print layout</p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
          >
            Print ITC
          </button>
        </div>
      </div>

      <div className="space-y-4 p-4 print:p-0">
        <div className="grid gap-px overflow-hidden rounded-lg border border-slate-300 bg-slate-300 text-sm">
          <div className="grid grid-cols-4 bg-white">
            <div className="border-r border-slate-200 p-2 font-semibold">Project No</div>
            <div className="border-r border-slate-200 p-2">{document.project_no}</div>
            <div className="border-r border-slate-200 p-2 font-semibold">Package</div>
            <div className="p-2">{document.package_name || projectName}</div>
          </div>
          <div className="grid grid-cols-4 bg-white">
            <div className="border-r border-slate-200 p-2 font-semibold">Zone</div>
            <div className="border-r border-slate-200 p-2">{document.zone}</div>
            <div className="border-r border-slate-200 p-2 font-semibold">Client</div>
            <div className="p-2">{document.client_name || "—"}</div>
          </div>
          <div className="grid grid-cols-4 bg-white">
            <div className="border-r border-slate-200 p-2 font-semibold">ITC No</div>
            <div className="border-r border-slate-200 p-2">{document.itc_number}</div>
            <div className="border-r border-slate-200 p-2 font-semibold">Service</div>
            <div className="p-2">{document.service_type}</div>
          </div>
          <div className="grid grid-cols-4 bg-white">
            <div className="border-r border-slate-200 p-2 font-semibold">Material & Size</div>
            <div className="border-r border-slate-200 p-2">{document.material_and_size}</div>
            <div className="border-r border-slate-200 p-2 font-semibold">Length (m)</div>
            <div className="p-2">{document.length_m ?? "—"}</div>
          </div>
          <div className="grid grid-cols-4 bg-white">
            <div className="border-r border-slate-200 p-2 font-semibold">Upstream Pit</div>
            <div className="border-r border-slate-200 p-2">{document.upstream_pit_number ?? "—"}</div>
            <div className="border-r border-slate-200 p-2 font-semibold">Downstream Pit</div>
            <div className="p-2">{document.downstream_pit_number ?? "—"}</div>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-300">
          <div className="bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800">
            Specification Grid
          </div>
          <div className="grid grid-cols-2 gap-px bg-slate-200 text-sm md:grid-cols-4">
            {[
              ["Min Horizontal Sep (mm)", document.specs.min_horizontal_sep_mm],
              ["Min Vertical Sep (mm)", document.specs.min_vertical_sep_mm],
              ["Min Bedding (mm)", document.specs.min_bedding_mm],
              ["Min Side (mm)", document.specs.min_side_mm],
              ["Min Overlay (mm)", document.specs.min_overlay_mm],
              ["Min Cover (mm)", document.specs.min_cover_mm],
              ["Bedding / Overlay", document.specs.bedding_and_overlay_material],
              ["Cover Material", document.specs.cover_material],
              ["No. Conduits", document.specs.number_of_conduits],
              ["Plan Rev", document.plan_rev],
            ].map(([label, value]) => (
              <div key={String(label)} className="bg-white p-2">
                <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
                <p className="text-sm text-slate-900">{value ?? "—"}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-300">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Inspection Activity</th>
                <th className="px-3 py-2">Check By</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Comments</th>
                <th className="px-3 py-2">Photo</th>
              </tr>
            </thead>
            <tbody>
              {document.activities.map((activity) => (
                <tr key={activity.id} className="border-t border-slate-200">
                  <td className="px-3 py-2">{activity.activity_number}</td>
                  <td className="px-3 py-2 font-medium">
                    {activity.title}
                    {activity.requires_photo ? (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                        Photo
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{activity.check_by ?? ""}</td>
                  <td className="px-3 py-2">{activity.checked_date ?? ""}</td>
                  <td className="px-3 py-2">{activity.comments ?? ""}</td>
                  <td className="px-3 py-2">
                    {activity.requires_photo ? (
                      <div className="h-10 w-16 rounded border border-dashed border-slate-300 bg-slate-50" />
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
