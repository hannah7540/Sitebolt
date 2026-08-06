"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, ExternalLink, Loader2 } from "lucide-react";
import {
  fetchCompanyInsurances,
  insertCompanyInsurance,
  type CompanyInsurance,
} from "@/lib/supabase";
import { getInsuranceExpiryStatus } from "@/lib/insurance-utils";
import InsuranceFormModal from "./InsuranceFormModal";
import { cn } from "@/lib/utils";
import { cardClass } from "@/lib/ui-classes";

export default function InsurancesPanel() {
  const [insurances, setInsurances] = useState<CompanyInsurance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setInsurances(await fetchCompanyInsurances());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Company <span className="text-orange-500">Insurances</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Track policy expiry and upload certificates.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
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
                  <div>
                    <p className="font-semibold text-slate-900">
                      {item.insurance_type}
                    </p>
                    <p className="text-sm text-slate-500">
                      Policy: {item.policy_number ?? "—"}
                    </p>
                    <p className="text-sm text-slate-500">
                      Expires: {item.expiry_date ?? "Not set"}
                    </p>
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

      {showAdd && (
        <InsuranceFormModal
          onClose={() => setShowAdd(false)}
          onSaved={async (input) => {
            const result = await insertCompanyInsurance(input);
            if (!result.error) await load();
            return result;
          }}
        />
      )}
    </div>
  );
}
