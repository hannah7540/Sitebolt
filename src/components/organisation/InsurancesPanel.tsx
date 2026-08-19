"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Loader2, Pencil, Trash2 } from "lucide-react";
import Toast from "@/components/ui/Toast";
import {
  deleteCompanyInsuranceFromApi,
  fetchCompanyInsurancesFromApi,
  saveCompanyInsuranceToApi,
  type CompanyInsuranceFormRecord,
} from "@/lib/organisation-insurances-api-client";
import {
  formatInsuranceDisplayDate,
  resolveInsuranceDisplayType,
} from "@/lib/organisation-insurances-api";
import {
  getInsuranceExpiryStatus,
  resolveInsuranceCoverageDisplay,
} from "@/lib/insurance-utils";
import { useFormToast } from "@/hooks/useFormToast";
import InsuranceFormModal from "./InsuranceFormModal";
import { cn } from "@/lib/utils";
import { cardClass } from "@/lib/ui-classes";

export default function InsurancesPanel() {
  const { toast, showError, showSuccess, dismissToast } = useFormToast();
  const [insurances, setInsurances] = useState<CompanyInsuranceFormRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingInsurance, setEditingInsurance] =
    useState<CompanyInsuranceFormRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { insurances: rows, error } = await fetchCompanyInsurancesFromApi();
      if (error) {
        setLoadError(error);
        setInsurances([]);
      } else {
        setInsurances(rows ?? []);
      }
    } catch (err) {
      console.error("Failed to load insurances:", err);
      setLoadError("Failed to load insurance policies.");
      setInsurances([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const closeModal = () => {
    setShowAdd(false);
    setEditingInsurance(null);
  };

  const openEdit = (item: CompanyInsuranceFormRecord) => {
    setShowAdd(false);
    setEditingInsurance(item);
  };

  const handleDelete = async (
    item: CompanyInsuranceFormRecord,
    event?: React.MouseEvent
  ) => {
    event?.stopPropagation();
    const label = resolveInsuranceDisplayType(item);
    if (!window.confirm(`Delete insurance policy "${label}"?`)) return;

    setDeletingId(item.id);
    try {
      const { error } = await deleteCompanyInsuranceFromApi(item.id);
      if (error) throw new Error(error);
      showSuccess("Insurance policy deleted");
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete insurance";
      console.error(err);
      showError(message);
    } finally {
      setDeletingId(null);
    }
  };

  const modalOpen = showAdd || editingInsurance !== null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Company <span className="text-orange-500">Insurances</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage policies, coverage, expiry dates, and certificates.
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
        <div className={cn(cardClass, "overflow-x-auto")}>
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Policy Name / Type</th>
                <th className="px-4 py-3">Insurer</th>
                <th className="px-4 py-3">Policy Number</th>
                <th className="px-4 py-3">Coverage</th>
                <th className="px-4 py-3">Expiry Date</th>
                <th className="px-4 py-3">Expiry Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {insurances.map((item) => {
                const expiry = getInsuranceExpiryStatus(item?.expiry_date);
                return (
                  <tr
                    key={item.id}
                    className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-orange-50/50"
                    onClick={() => openEdit(item)}
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {resolveInsuranceDisplayType(item)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item?.provider?.trim() || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {item?.policy_number?.trim() || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {resolveInsuranceCoverageDisplay(item)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatInsuranceDisplayDate(item?.expiry_date)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "rounded px-2 py-0.5 text-xs font-bold",
                          expiry.badgeClass
                        )}
                      >
                        {expiry.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openEdit(item);
                          }}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-orange-700"
                        >
                          <Pencil className="h-3 w-3" />
                          View / Edit
                        </button>
                        <button
                          type="button"
                          disabled={deletingId === item.id}
                          onClick={(event) => void handleDelete(item, event)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          {deletingId === item.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <InsuranceFormModal
          insurance={editingInsurance}
          onClose={closeModal}
          onSaved={async (input, context) => {
            try {
              const { error } = await saveCompanyInsuranceToApi(input);
              if (error) throw new Error(error);
              if (context?.uploadWarning) {
                showError(context.uploadWarning);
              } else {
                showSuccess("Insurance policy saved successfully");
              }
              closeModal();
              await load();
              return { error: null };
            } catch (err) {
              const message =
                err instanceof Error ? err.message : "Server error saving insurance";
              console.error("Insurance save failed in panel:", err);
              showError(message);
              return { error: message };
            }
          }}
        />
      )}

      {toast ? (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      ) : null}
    </div>
  );
}
