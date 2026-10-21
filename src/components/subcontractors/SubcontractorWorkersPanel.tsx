"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { SubcontractorPortalWorker } from "@/lib/subcontractor-portal-resources";
import { cardClass } from "@/lib/ui-classes";
import SubcontractorNewWorkerModal from "./SubcontractorNewWorkerModal";

export default function SubcontractorWorkersPanel({
  subcontractorId,
  organisationId,
  workers,
}: {
  subcontractorId: string;
  organisationId?: string;
  workers: SubcontractorPortalWorker[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Add your people here. They can then log in to complete SWMS and competency uploads.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600"
        >
          <Plus className="h-4 w-4" />
          New Worker
        </button>
      </div>

      <section className={`${cardClass} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Trade</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Competency Status</th>
              </tr>
            </thead>
            <tbody>
              {workers.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-slate-500" colSpan={5}>
                    No workers added yet.
                  </td>
                </tr>
              ) : (
                workers.map((worker) => (
                  <tr key={worker.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">{worker.name}</td>
                    <td className="px-4 py-3 text-slate-600">{worker.trade}</td>
                    <td className="px-4 py-3 text-slate-600">{worker.email}</td>
                    <td className="px-4 py-3 text-slate-600">{worker.phone}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        {worker.competency_status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {open ? (
        <SubcontractorNewWorkerModal
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
