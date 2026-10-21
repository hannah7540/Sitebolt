"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { SubcontractorPortalPlant } from "@/lib/subcontractor-portal-resources";
import { cardClass } from "@/lib/ui-classes";
import SubcontractorNewPlantModal from "./SubcontractorNewPlantModal";

export default function SubcontractorPlantPanel({
  subcontractorId,
  organisationId,
  plant,
}: {
  subcontractorId: string;
  organisationId?: string;
  plant: SubcontractorPortalPlant[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Register the plant and equipment your crews bring to site.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600"
        >
          <Plus className="h-4 w-4" />
          New Plant
        </button>
      </div>

      <section className={`${cardClass} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Make</th>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3">Serial Number</th>
                <th className="px-4 py-3">Next Service Date</th>
              </tr>
            </thead>
            <tbody>
              {plant.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-slate-500" colSpan={4}>
                    No plant added yet.
                  </td>
                </tr>
              ) : (
                plant.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">{item.make}</td>
                    <td className="px-4 py-3 text-slate-600">{item.model}</td>
                    <td className="px-4 py-3 text-slate-600">{item.serial_number}</td>
                    <td className="px-4 py-3 text-slate-600">{item.next_service_date}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {open ? (
        <SubcontractorNewPlantModal
          subcontractorId={subcontractorId}
          organisationId={organisationId}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
