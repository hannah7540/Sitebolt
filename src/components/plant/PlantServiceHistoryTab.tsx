"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  deletePlantServiceHistory,
  fetchPlantServiceHistory,
  formatPlantServiceHistoryDate,
  insertPlantServiceHistory,
  type PlantServiceHistoryRecord,
} from "@/lib/plant-service-history";
import { cn } from "@/lib/utils";
import { cardClass, inputClass, labelClass, sectionClass } from "@/lib/ui-classes";

interface PlantServiceHistoryTabProps {
  plantId: string;
}

export default function PlantServiceHistoryTab({ plantId }: PlantServiceHistoryTabProps) {
  const [records, setRecords] = useState<PlantServiceHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [serviceDate, setServiceDate] = useState("");
  const [hoursLogged, setHoursLogged] = useState("");
  const [description, setDescription] = useState("");
  const [technicianCompany, setTechnicianCompany] = useState("");

  const loadRecords = useCallback(async () => {
    setLoading(true);
    const rows = await fetchPlantServiceHistory(plantId);
    setRecords(rows);
    setLoading(false);
  }, [plantId]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const resetForm = () => {
    setServiceDate("");
    setHoursLogged("");
    setDescription("");
    setTechnicianCompany("");
    setShowForm(false);
    setError(null);
  };

  const handleAddRecord = async () => {
    if (!serviceDate.trim()) {
      setError("Service date is required.");
      return;
    }

    const parsedHours = hoursLogged.trim() ? Number(hoursLogged) : null;
    if (hoursLogged.trim() && Number.isNaN(parsedHours)) {
      setError("Hours logged must be a valid number.");
      return;
    }

    setSaving(true);
    setError(null);

    const result = await insertPlantServiceHistory(plantId, {
      serviceDate: serviceDate.trim(),
      hoursLogged: parsedHours,
      description: description.trim() || null,
      technicianCompany: technicianCompany.trim() || null,
    });

    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    resetForm();
    await loadRecords();
  };

  const handleDelete = async (recordId: string) => {
    const confirmed = window.confirm("Delete this service history record?");
    if (!confirmed) return;

    const result = await deletePlantServiceHistory(recordId);
    if (result.error) {
      setError(result.error);
      return;
    }

    await loadRecords();
  };

  return (
    <div className={cn(sectionClass, "space-y-4")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Service History</h3>
          <p className="text-sm text-slate-500">
            Record past services with date, hours, description, and technician or company.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((value) => !value)}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-500"
        >
          <Plus className="h-4 w-4" />
          Add service record
        </button>
      </div>

      {showForm ? (
        <div className={cn(cardClass, "space-y-4 p-4")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>Service date *</span>
              <input
                type="date"
                className={inputClass}
                value={serviceDate ?? ""}
                onChange={(event) => setServiceDate(event.target.value)}
                disabled={saving}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Hours logged</span>
              <input
                type="number"
                min="0"
                step="0.1"
                className={inputClass}
                value={hoursLogged ?? ""}
                onChange={(event) => setHoursLogged(event.target.value)}
                disabled={saving}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className={labelClass}>Technician / company</span>
              <input
                className={inputClass}
                value={technicianCompany ?? ""}
                onChange={(event) => setTechnicianCompany(event.target.value)}
                disabled={saving}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className={labelClass}>Description</span>
              <textarea
                className={inputClass}
                rows={3}
                value={description ?? ""}
                onChange={(event) => setDescription(event.target.value)}
                disabled={saving}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleAddRecord()}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save record
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading service history…
        </div>
      ) : records.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
          No service records yet.
        </p>
      ) : (
        <div className={`overflow-x-auto ${cardClass}`}>
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Hours</th>
                <th className="px-4 py-3">Technician / Company</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 text-slate-900">
                    {formatPlantServiceHistoryDate(record.service_date)}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {record.hours_logged != null ? `${record.hours_logged} hrs` : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {record.technician_company ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {record.description ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => void handleDelete(record.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
