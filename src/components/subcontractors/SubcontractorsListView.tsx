"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, Loader2, Plus } from "lucide-react";
import {
  fetchSubcontractorById,
  fetchSubcontractors,
  coerceSubcontractor,
  getSubcontractorContactName,
  getSubcontractorEmail,
  getSubcontractorPhone,
  getSubcontractorStatusLabel,
  getSubcontractorTrade,
  isSubcontractorArchived,
  setSubcontractorArchiveState,
  type Subcontractor,
} from "@/lib/subcontractors";
import AddSubcontractorModal from "./AddSubcontractorModal";
import SubcontractorProfileView from "./SubcontractorProfileView";
import { cn } from "@/lib/utils";
import { cardClass } from "@/lib/ui-classes";

type SubcontractorTabFilter = "Current" | "Archived" | "All";

interface SubcontractorsListViewProps {
  loading?: boolean;
  initialShowAdd?: boolean;
  initialSubcontractorId?: string | null;
  onRefresh?: () => void;
}

const TAB_FILTERS: Array<{ id: SubcontractorTabFilter; label: string }> = [
  { id: "Current", label: "Current Subcontractors" },
  { id: "Archived", label: "Archived Subcontractors" },
  { id: "All", label: "All" },
];

export default function SubcontractorsListView({
  loading: parentLoading = false,
  initialShowAdd = false,
  initialSubcontractorId = null,
  onRefresh,
}: SubcontractorsListViewProps) {
  const [subcontractorsList, setSubcontractorsList] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<SubcontractorTabFilter>("Current");
  const [showAdd, setShowAdd] = useState(initialShowAdd);
  const [selectedId, setSelectedId] = useState<string | null>(initialSubcontractorId);
  const [selectedSubcontractor, setSelectedSubcontractor] = useState<Subcontractor | null>(
    null
  );
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await fetchSubcontractors();
    setSubcontractorsList(rows);
    setLoading(false);
    onRefresh?.();
  }, [onRefresh]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (initialShowAdd) setShowAdd(true);
  }, [initialShowAdd]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedSubcontractor(null);
      return;
    }
    fetchSubcontractorById(selectedId).then((row) =>
      setSelectedSubcontractor(row ? coerceSubcontractor(row) : null)
    );
  }, [selectedId]);

  const displayedSubcontractors = useMemo(() => {
    return subcontractorsList.filter((item) => {
      const archived = isSubcontractorArchived(item);
      if (activeTab === "Archived") return archived;
      if (activeTab === "Current") return !archived;
      return true;
    });
  }, [subcontractorsList, activeTab]);

  const handleSaved = (subcontractorId: string) => {
    load();
    setSelectedId(subcontractorId);
  };

  const patchSubcontractor = (updated: Subcontractor) => {
    setSubcontractorsList((prev) =>
      prev.map((row) => (row.id === updated.id ? updated : row))
    );
    setSelectedSubcontractor(updated);
  };

  const handleArchiveToggle = async (subcontractor: Subcontractor) => {
    const subbie = coerceSubcontractor(subcontractor);
    const nextArchived = !isSubcontractorArchived(subbie);
    const snapshot = subbie;

    setActionId(subbie.id);
    setSubcontractorsList((prev) =>
      prev.map((row) =>
        row.id === subbie.id
          ? {
              ...row,
              is_archived: nextArchived,
              status: nextArchived ? "Archived" : "Active",
            }
          : row
      )
    );

    const { error } = await setSubcontractorArchiveState(subbie.id, nextArchived);
    setActionId(null);

    if (error) {
      setSubcontractorsList((prev) =>
        prev.map((row) => (row.id === subbie.id ? snapshot : row))
      );
      alert(error);
    }
  };

  if (selectedId && selectedSubcontractor) {
    return (
      <SubcontractorProfileView
        subcontractor={selectedSubcontractor}
        onBack={() => setSelectedId(null)}
        onRefresh={load}
        onSubcontractorUpdated={patchSubcontractor}
      />
    );
  }

  const isLoading = loading || parentLoading;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Subcontractors <span className="text-orange-500">Directory</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage subcontractor companies, workers, plant, and documents.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
        >
          <Plus className="h-4 w-4" />
          Add New Subcontractor
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {TAB_FILTERS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold transition",
              activeTab === tab.id
                ? "bg-orange-500 text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading subcontractors…
        </div>
      ) : displayedSubcontractors.length === 0 ? (
        <p className={`p-6 text-sm text-slate-500 ${cardClass}`}>
          {activeTab === "Current"
            ? "No current subcontractors. Add one or reactivate from Archived."
            : activeTab === "Archived"
              ? "No archived subcontractors."
              : "No subcontractors registered yet. Add your first subcontractor to get started."}
        </p>
      ) : (
        <div className={`overflow-x-auto ${cardClass}`}>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-orange-50/50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Trade</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedSubcontractors.map((sub) => {
                const subbie = coerceSubcontractor(sub);
                const contactLabel = getSubcontractorContactName(subbie);
                const phoneLabel = getSubcontractorPhone(subbie);
                const tradeLabel = getSubcontractorTrade(subbie);
                const statusLabel = getSubcontractorStatusLabel(subbie);
                const archived = isSubcontractorArchived(subbie);
                return (
                  <tr
                    key={subbie.id}
                    className="cursor-pointer border-b border-slate-100 transition hover:bg-orange-50/40"
                    onClick={() => setSelectedId(subbie.id)}
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">{subbie.company_name}</td>
                    <td className="px-4 py-3 text-slate-600">{tradeLabel}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {contactLabel !== "N/A"
                        ? contactLabel
                        : getSubcontractorEmail(subbie) || (phoneLabel !== "N/A" ? phoneLabel : "—")}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "rounded px-2 py-0.5 text-xs font-bold",
                          archived && "bg-slate-200 text-slate-700",
                          !archived &&
                            (subbie.status === "active" || subbie.status === "Active") &&
                            "bg-emerald-100 text-emerald-800",
                          subbie.status === "inactive" && "bg-slate-100 text-slate-600",
                          subbie.status === "suspended" && "bg-red-100 text-red-800"
                        )}
                      >
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={actionId === subbie.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleArchiveToggle(subbie);
                        }}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50",
                          archived
                            ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                            : "border-slate-200 text-slate-700 hover:border-orange-300 hover:text-orange-600"
                        )}
                      >
                        {archived ? (
                          <>
                            <ArchiveRestore className="h-3.5 w-3.5" />
                            Reactivate Subcontractor
                          </>
                        ) : (
                          <>
                            <Archive className="h-3.5 w-3.5" />
                            Archive Subcontractor
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <AddSubcontractorModal
          onClose={() => setShowAdd(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
