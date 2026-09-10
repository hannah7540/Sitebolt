"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Loader2, Trash2 } from "lucide-react";
import BulkAddCompanyRdosModal from "@/components/administration/BulkAddCompanyRdosModal";
import {
  COMPANY_CALENDAR_STATES,
  deleteCompanyCalendarDay,
  fetchCompanyCalendarDays,
  insertCompanyCalendarDays,
  preloadPublicHolidays2026,
  type CompanyCalendarDay,
  type CompanyCalendarDayType,
} from "@/lib/company-calendar-days";
import { formatDateOnly } from "@/lib/scheduler-utils";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";

function formatDisplayDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function CompanyCalendarHolidaysPanel() {
  const { toast, showError, showSuccess, dismissToast } = useFormToast();
  const [days, setDays] = useState<CompanyCalendarDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showBulkRdos, setShowBulkRdos] = useState(false);
  const [yearFilter, setYearFilter] = useState("2026");
  const [stateFilter, setStateFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState<"all" | CompanyCalendarDayType>("all");
  const [form, setForm] = useState({
    date: formatDateOnly(new Date()),
    day_type: "public_holiday" as CompanyCalendarDayType,
    title: "",
    state: "ALL",
    roles: "",
  });

  const loadDays = useCallback(async () => {
    setLoading(true);
    const rows = await fetchCompanyCalendarDays();
    setDays(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadDays();
  }, [loadDays]);

  const filteredDays = useMemo(() => {
    return days.filter((day) => {
      if (yearFilter && !day.date.startsWith(yearFilter)) return false;
      if (stateFilter !== "ALL" && day.state !== stateFilter && day.state !== "ALL") {
        return false;
      }
      if (typeFilter !== "all" && day.day_type !== typeFilter) return false;
      return true;
    });
  }, [days, stateFilter, typeFilter, yearFilter]);

  const handlePreload = async () => {
    setBusy(true);
    const result = await preloadPublicHolidays2026();
    setBusy(false);
    if (result.error) {
      showError(result.error);
      return;
    }
    showSuccess(`Preloaded ${result.saved} 2026 public holidays.`);
    await loadDays();
  };

  const handleAdd = async () => {
    if (!form.date || !form.title.trim()) {
      showError("Enter a date and title.");
      return;
    }
    setBusy(true);
    const roles = form.roles
      .split(",")
      .map((role) => role.trim())
      .filter(Boolean);
    const result = await insertCompanyCalendarDays([
      {
        date: form.date,
        day_type: form.day_type,
        title: form.title,
        state: form.state,
        applicable_roles: roles.length > 0 ? roles : null,
      },
    ]);
    setBusy(false);
    if (result.error) {
      showError(result.error);
      return;
    }
    showSuccess("Calendar day saved.");
    setForm((current) => ({ ...current, title: "", roles: "" }));
    await loadDays();
  };

  const handleDelete = async (id: string) => {
    setBusy(true);
    const result = await deleteCompanyCalendarDay(id);
    setBusy(false);
    if (result.error) {
      showError(result.error);
      return;
    }
    showSuccess("Calendar day removed.");
    await loadDays();
  };

  return (
    <div className="space-y-6">
      <section className={cn(cardClass, "p-5")}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <CalendarDays className="h-9 w-9 shrink-0 text-orange-500" />
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Company Calendar & Holidays
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Public holidays and industry RDOs are excluded from annual leave
                deductions and shown on worker calendars.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handlePreload()}
              className="inline-flex min-h-10 items-center rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Preload 2026 Holidays
            </button>
            <button
              type="button"
              onClick={() => setShowBulkRdos(true)}
              className="inline-flex min-h-10 items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Bulk Add RDOs
            </button>
          </div>
        </div>
      </section>

      <section className={cn(cardClass, "p-5")}>
        <h3 className="text-sm font-semibold text-slate-900">Add individual date</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="block space-y-1">
            <span className={labelClass}>Date</span>
            <input
              type="date"
              className={inputClass}
              value={form.date}
              onChange={(event) =>
                setForm((current) => ({ ...current, date: event.target.value }))
              }
            />
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>Type</span>
            <select
              className={inputClass}
              value={form.day_type}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  day_type: event.target.value as CompanyCalendarDayType,
                }))
              }
            >
              <option value="public_holiday">Public Holiday</option>
              <option value="rdo">RDO</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>Title</span>
            <input
              className={inputClass}
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="Labour Day / King's Birthday"
            />
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>State</span>
            <select
              className={inputClass}
              value={form.state}
              onChange={(event) =>
                setForm((current) => ({ ...current, state: event.target.value }))
              }
            >
              {COMPANY_CALENDAR_STATES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>Roles (optional)</span>
            <input
              className={inputClass}
              value={form.roles}
              onChange={(event) =>
                setForm((current) => ({ ...current, roles: event.target.value }))
              }
              placeholder="All employees"
            />
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleAdd()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Add date
          </button>
        </div>
      </section>

      <section className={cn(cardClass, "p-5")}>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <label className="block space-y-1">
            <span className={labelClass}>Year</span>
            <input
              className={inputClass}
              value={yearFilter}
              onChange={(event) => setYearFilter(event.target.value)}
              placeholder="2026"
            />
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>State</span>
            <select
              className={inputClass}
              value={stateFilter}
              onChange={(event) => setStateFilter(event.target.value)}
            >
              {COMPANY_CALENDAR_STATES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>Type</span>
            <select
              className={inputClass}
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(event.target.value as "all" | CompanyCalendarDayType)
              }
            >
              <option value="all">All</option>
              <option value="public_holiday">Public holidays</option>
              <option value="rdo">RDOs</option>
            </select>
          </label>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
            Loading company calendar…
          </div>
        ) : filteredDays.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            No holiday or RDO dates match these filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2 font-semibold">Date</th>
                  <th className="px-2 py-2 font-semibold">Type</th>
                  <th className="px-2 py-2 font-semibold">Title</th>
                  <th className="px-2 py-2 font-semibold">State</th>
                  <th className="px-2 py-2 font-semibold">Roles</th>
                  <th className="px-2 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {filteredDays.map((day) => (
                  <tr key={day.id} className="border-b border-slate-100">
                    <td className="px-2 py-2 whitespace-nowrap text-slate-800">
                      {formatDisplayDate(day.date)}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase",
                          day.day_type === "rdo"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-indigo-100 text-indigo-800"
                        )}
                      >
                        {day.day_type === "rdo" ? "RDO" : "Public Holiday"}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-slate-800">{day.title}</td>
                    <td className="px-2 py-2 text-slate-600">{day.state}</td>
                    <td className="px-2 py-2 text-slate-500">
                      {day.applicable_roles?.join(", ") || "All employees"}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleDelete(day.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Remove ${day.title}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showBulkRdos ? (
        <BulkAddCompanyRdosModal
          onClose={() => setShowBulkRdos(false)}
          onSaved={() => {
            showSuccess("RDOs saved to the company calendar.");
            void loadDays();
          }}
        />
      ) : null}

      {toast ? (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onDismiss={dismissToast}
        />
      ) : null}
    </div>
  );
}
