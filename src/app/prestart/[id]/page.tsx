"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { fetchPlantById, type PlantAsset } from "@/lib/supabase";
import PrestartForm from "@/components/prestart/PrestartForm";
import TagOutWarning from "@/components/prestart/TagOutWarning";
import CompanyLogo from "@/components/ui/CompanyLogo";
import { isTaggedOut } from "@/lib/plant-utils";

export default function PrestartPage() {
  const params = useParams();
  const id = params.id as string;
  const [plant, setPlant] = useState<PlantAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const data = await fetchPlantById(id);
      if (!data) {
        setError("Machine not found. Check the QR code and try again.");
      } else {
        setPlant(data);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <header className="border-b border-slate-200 bg-white px-4 py-4 shadow-sm">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
              Plant Pre-Start
            </p>
            <p className="text-sm text-slate-500">Daily equipment inspection</p>
          </div>
          <CompanyLogo size="md" showFallback />
        </div>
      </header>

      {loading && (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      )}

      {error && (
        <div className="mx-auto mt-10 flex max-w-sm flex-col items-center gap-3 px-4 text-center">
          <AlertCircle className="h-12 w-12 text-red-500" />
          <p className="text-slate-600">{error}</p>
        </div>
      )}

      {plant && !loading && isTaggedOut(plant) && (
        <TagOutWarning plant={plant} />
      )}

      {plant && !loading && !isTaggedOut(plant) && (
        <PrestartForm plant={plant} />
      )}
    </div>
  );
}
