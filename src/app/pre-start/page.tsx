"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import FleetPrestartForm from "@/components/prestart/FleetPrestartForm";
import PlantPrestartPageClient from "@/components/prestart/PlantPrestartPageClient";
import PrestartAuthGate from "@/components/prestart/PrestartAuthGate";
import CompanyLogo from "@/components/ui/CompanyLogo";
import { loadFleetVehicleForPrestart } from "@/lib/fleet-prestart";
import { isFleetPrestartSearchParams } from "@/lib/fleet-prestart-url";
import { sanitizePlantPrestartId } from "@/lib/plant-prestart-url";
import type { OrganizationFleetVehicle } from "@/lib/organization-fleet";

function PreStartQueryContent() {
  const searchParams = useSearchParams();
  const type = searchParams.get("type");
  const id = sanitizePlantPrestartId(searchParams.get("id"));
  const isFleet = isFleetPrestartSearchParams(type, id);

  const [vehicle, setVehicle] = useState<OrganizationFleetVehicle | null>(null);
  const [loading, setLoading] = useState(isFleet);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFleet) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void loadFleetVehicleForPrestart(id).then((row) => {
      if (cancelled) return;
      if (!row) {
        setError("Fleet vehicle not found. Check the QR code and try again.");
      } else {
        setVehicle(row);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [id, isFleet]);

  if (isFleet) {
    return (
      <div className="min-h-screen bg-transparent text-slate-900">
        <header className="border-b border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="mx-auto flex max-w-lg items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
                Fleet Pre-Start
              </p>
              <p className="text-sm text-slate-500">Daily vehicle inspection</p>
            </div>
            <CompanyLogo size="md" showFallback />
          </div>
        </header>
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
          </div>
        ) : null}
        {error ? (
          <div className="mx-auto mt-10 flex max-w-sm flex-col items-center gap-3 px-4 text-center">
            <AlertCircle className="h-12 w-12 text-red-500" />
            <p className="text-slate-600">{error}</p>
          </div>
        ) : null}
        {vehicle && !loading ? <FleetPrestartForm vehicle={vehicle} /> : null}
      </div>
    );
  }

  if (id) {
    return <PlantPrestartPageClient plantId={id} />;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <AlertCircle className="mb-3 h-12 w-12 text-red-500" />
      <p className="text-slate-600">Scan a plant or fleet QR code to open the pre-start form.</p>
    </div>
  );
}

export default function PreStartQueryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      }
    >
      <PrestartAuthGate>
        <PreStartQueryContent />
      </PrestartAuthGate>
    </Suspense>
  );
}
