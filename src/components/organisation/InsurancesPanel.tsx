"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, ExternalLink, Loader2, Pencil } from "lucide-react";
import {
  fetchCompanyInsurancesFromApi,
  saveCompanyInsuranceToApi,
  type CompanyInsuranceFormRecord,
} from "@/lib/organisation-insurances-api-client";
import { formatInsuranceDateRange } from "@/lib/organisation-insurances-api";
import {
  formatInsuranceRegionBadges,
  getInsuranceExpiryStatus,
} from "@/lib/insurance-utils";
import InsuranceFormModal from "./InsuranceFormModal";
import { cn } from "@/lib/utils";
import { cardClass } from "@/lib/ui-classes";

function InsuranceRegionBadges({ item }: { item: CompanyInsuranceFormRecord }) {
  const badges = formatInsuranceRegionBadges(item);

  if (badges.length === 0) {
    return (
      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
        No regions selected
      </span>
    );
  }

  if (badges.length === 1 && badges[0].startsWith("All Regions")) {
    return (
      <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
        {badges[0]}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map((region) => (
        <span
          key={region}
          className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700"
        >
          {region}
        </span>
      ))}
    </div>
  );
}

export default function InsurancesPanel() {
  const [insurances, setInsurances] = useState<CompanyInsuranceFormRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingInsurance, setEditingInsurance] =
    useState<CompanyInsuranceFormRecord | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { insurances: rows, error } = await fetchCompanyInsurancesFromApi();
    if (error) {
      setLoadError(error);
      setInsurances([]);
    } else {
      setInsurances(rows);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const modalOpen = showAdd || editingInsurance !== null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Company <span className="text-orange-500">Insurances</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Track policy start dates, expiry, and upload certificates.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingInsurance(null);
            setShowAdd(true);
          }}
          className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
        >
          <Plus className="h-4 w-4" />
          Add Insurance
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading insurances…
        </div>
      ) : loadError ? (
        <p className={`p-6 text-sm text-red-700 ${cardClass}`}>{loadError}</p>
      ) : insurances.length === 0 ? (
        <p className={`p-6 text-sm text-slate-500 ${cardClass}`}>
          No insurance policies recorded yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {insurances.map((item) => {
            const expiry = getInsuranceExpiryStatus(item.expiry_date);
            return (
              <li key={item.id} className={cn(cardClass, "p-4")}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">
                        {item.insurance_type}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAdd(false);
                          setEditingInsurance(item);
                        }}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-orange-700"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </button>
                    </div>
                    <p className="text-sm text-slate-500">
                      Policy: {item.policy_number ?? "—"}
                    </p>
                    <p className="text-sm text-slate-600">
                      {formatInsuranceDateRange(item)}
                    </p>
                    <InsuranceRegionBadges item={item} />
                  </div>
                  <span
                    className={cn(
                      "rounded px-2 py-0.5 text-xs font-bold",
                      expiry.badgeClass
                    )}
                  >
                    {expiry.label}
                  </span>
                </div>
                {item.document_url && (
                  <a
                    href={item.document_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-orange-600 hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View document
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {modalOpen && (
        <InsuranceFormModal
          insurance={editingInsurance}
          onClose={() => {
            setShowAdd(false);
            setEditingInsurance(null);
          }}
          onSaved={async (input) => {
            const { error } = await saveCompanyInsuranceToApi(input);
            if (!error) await load();
            return { error };
          }}
        />
      )}
    </div>
  );
}
