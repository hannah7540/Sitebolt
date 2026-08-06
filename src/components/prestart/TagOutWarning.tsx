"use client";

import { AlertTriangle, Phone, Ban } from "lucide-react";
import type { PlantAsset } from "@/lib/supabase";

interface TagOutWarningProps {
  plant: PlantAsset;
}

export default function TagOutWarning({ plant }: TagOutWarningProps) {
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-6 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <Ban className="h-8 w-8 text-red-600" />
        </div>
        <h1 className="text-xl font-bold uppercase tracking-wide text-red-700">
          Out of Service / Tagged Out
        </h1>
        <p className="mt-2 text-lg font-semibold text-slate-900">{plant.unit_number}</p>
        <p className="mt-4 text-sm text-slate-600">
          This machine has an active defect tag and{" "}
          <strong className="text-red-700">must not be operated</strong>.
        </p>
        <div className="mt-6 flex items-start gap-3 rounded-lg border border-red-300 bg-red-100 p-4 text-left text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            Do not attempt a pre-start. Contact your supervisor or site admin to
            resolve the defect and clear the tag-out before use.
          </p>
        </div>
        {plant.service_contact_name && plant.service_contact_phone && (
          <a
            href={`tel:${plant.service_contact_phone.replace(/\s/g, "")}`}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-3 text-sm font-medium text-slate-900 hover:bg-orange-50"
          >
            <Phone className="h-4 w-4" />
            Call {plant.service_contact_name}
          </a>
        )}
      </div>
    </div>
  );
}
