"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Loader2,
  Mail,
  RefreshCw,
  Save,
  Truck,
  Users,
  Wrench,
} from "lucide-react";
import WorkerSearchSelect from "@/components/assets/WorkerSearchSelect";
import AlertRenewModal from "@/components/organisation/AlertRenewModal";
import {
  COMPLIANCE_ALERT_FILTER_OPTIONS,
  fetchComplianceAlerts,
  filterComplianceAlerts,
  getComplianceAlertStatus,
  type ComplianceAlertFilter,
  type ComplianceAlertItem,
} from "@/lib/compliance-alerts-hub";
import {
  fetchExpiryAlertSettings,
  formatSecondaryRecipientsForInput,
  parseSecondaryRecipientInput,
  saveExpiryAlertSettings,
} from "@/lib/expiry-alert-settings";
import { fetchWorkers, type Worker } from "@/lib/supabase";
import { SECURITY_ROLE_LABELS, normalizeSecurityRole } from "@/lib/security-roles";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

function categoryLabel(category: ComplianceAlertItem["category"]): string {
  switch (category) {
    case "heavy_vehicle_check":
      return "Heavy Vehicle Check";
    case "fleet_registration":
      return "Fleet Registration";
    case "plant_registration":
      return "Plant Registration";
    case "worker_ticket":
      return "Worker Ticket / License";
    default:
      return "Alert";
  }
}

function CategoryIcon({ category }: { category: ComplianceAlertItem["category"] }) {
  switch (category) {
    case "heavy_vehicle_check":
      return <Truck className="h-4 w-4 text-orange-600" />;
    case "fleet_registration":
      return <Truck className="h-4 w-4 text-blue-600" />;
    case "plant_registration":
      return <Wrench className="h-4 w-4 text-emerald-600" />;
    default:
      return <Users className="h-4 w-4 text-violet-600" />;
  }
}

export default function OrganisationAlertsPanel() {
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [runningCheck, setRunningCheck] = useState(false);
  const [filter, setFilter] = useState<ComplianceAlertFilter>("all");
  const [alerts, setAlerts] = useState<ComplianceAlertItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({ all: 0 });
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [automatedEnabled, setAutomatedEnabled] = useState(true);
  const [secondaryRecipients, setSecondaryRecipients] = useState("");
  const [recipientWorkerIds, setRecipientWorkerIds] = useState<string[]>([]);
  const [renewAlert, setRenewAlert] = useState<ComplianceAlertItem | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const notificationWorkers = useMemo(
    () =>
      workers.filter(
        (worker) =>
          !worker.is_revoked &&
          !worker.is_archived &&
          Boolean(worker.email?.trim())
      ),
    [workers]
  );

  const filteredAlerts = useMemo(
    () => filterComplianceAlerts(alerts, filter),
    [alerts, filter]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [summary, settings, workerRows] = await Promise.all([
        fetchComplianceAlerts(),
        fetchExpiryAlertSettings(),
        fetchWorkers(),
      ]);
      setAlerts(summary.alerts);
      setCounts(summary.counts);
      setWorkers(workerRows);
      setAutomatedEnabled(settings.automated_emails_enabled);
      setSecondaryRecipients(formatSecondaryRecipientsForInput(settings.secondary_recipient_emails));
      setRecipientWorkerIds(settings.notification_recipient_worker_ids ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load alerts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    setError(null);
    setSuccessMessage(null);

    const { error: saveError } = await saveExpiryAlertSettings({
      automated_emails_enabled: automatedEnabled,
      secondary_recipient_emails: parseSecondaryRecipientInput(secondaryRecipients),
      notification_recipient_worker_ids: recipientWorkerIds,
    });

    setSavingSettings(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    setSuccessMessage("Notification settings saved.");
  };

  const handleRunCheck = async () => {
    setRunningCheck(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/alerts/check-expiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const payload = (await response.json()) as {
        error?: string;
        skipped?: boolean;
        reason?: string;
        emailsSent?: number;
      };

      if (!response.ok) {
        setError(payload.error ?? "Expiry check failed.");
        return;
      }

      setSuccessMessage(
        payload.skipped
          ? (payload.reason ?? "Expiry check skipped.")
          : `Automated check complete. ${payload.emailsSent ?? 0} email(s) sent.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run expiry check.");
    } finally {
      setRunningCheck(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">
          Organisation <span className="text-orange-500">/ Alerts</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Unified compliance alerts for heavy vehicle checks, fleet and plant registrations, and
          worker tickets.
        </p>
      </div>

      {successMessage ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {successMessage}
        </p>
      ) : null}

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {COMPLIANCE_ALERT_FILTER_OPTIONS.filter((option) => option.id !== "all").map((option) => (
          <div key={option.id} className={cn("flex items-center gap-4 p-5", cardClass)}>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-slate-500">{option.label}</p>
              <p className="text-2xl font-bold text-slate-900">{counts[option.id] ?? 0}</p>
            </div>
          </div>
        ))}
        <div className={cn("flex items-center gap-4 p-5", cardClass)}>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 text-red-600">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Total Active Alerts</p>
            <p className="text-2xl font-bold text-slate-900">{counts.all ?? 0}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className={cn("p-6", cardClass)}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Compliance Alerts</h2>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {COMPLIANCE_ALERT_FILTER_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setFilter(option.id)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold",
                  filter === option.id
                    ? "bg-orange-600 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <p className="mb-4 text-xs text-slate-500">
            {COMPLIANCE_ALERT_FILTER_OPTIONS.find((option) => option.id === filter)?.description}
          </p>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
              Loading alerts…
            </div>
          ) : filteredAlerts.length === 0 ? (
            <p className="text-sm text-slate-600">No active alerts for this filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-semibold">Type</th>
                    <th className="px-3 py-2 font-semibold">Asset / Worker</th>
                    <th className="px-3 py-2 font-semibold">Document</th>
                    <th className="px-3 py-2 font-semibold">Due / Expiry</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAlerts.map((alert) => (
                    <tr key={alert.id} className="border-b border-slate-100">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <CategoryIcon category={alert.category} />
                          <span>{categoryLabel(alert.category)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-medium text-slate-900">{alert.title}</p>
                        <p className="text-xs text-slate-500">{alert.subtitle}</p>
                      </td>
                      <td className="px-3 py-3">{alert.documentLabel}</td>
                      <td className="px-3 py-3">
                        {new Date(`${alert.expiryDate}T12:00:00`).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                            getComplianceAlertStatus(alert.daysRemaining).badgeClass
                          )}
                        >
                          {alert.statusLabel}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => setRenewAlert(alert)}
                          className="rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-xs font-semibold text-orange-800 hover:bg-orange-100"
                        >
                          Update / Renew
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className={cn("space-y-5 p-5", cardClass)}>
          <div>
            <h2 className="font-semibold text-slate-900">Notification Recipients</h2>
            <p className="mt-1 text-xs text-slate-500">
              Choose workers or managers who receive automated expiry emails. If none are selected,
              full-access and admin-access users are used by default.
            </p>
          </div>

          <WorkerSearchSelect
            mode="multiple"
            workers={notificationWorkers}
            selected={recipientWorkerIds}
            onChange={setRecipientWorkerIds}
            label="Alert recipients"
            searchPlaceholder="Search workers or managers by name or email..."
            placeholder="Select notification recipients"
            getWorkerLabel={(worker) => {
              const role = normalizeSecurityRole(worker.security_role);
              const roleLabel = SECURITY_ROLE_LABELS[role];
              const isManager =
                role === "owner" ||
                role === "super_admin" ||
                role === "full_access" ||
                role === "project_super_admin";
              const name = getWorkerDisplayName(worker);
              return isManager ? `${name} · ${roleLabel}` : name;
            }}
          />

          <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-3">
            <span className="text-sm font-medium text-slate-900">Enable automated emails</span>
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
              checked={automatedEnabled}
              onChange={(event) => setAutomatedEnabled(event.target.checked)}
            />
          </label>

          <label className="block space-y-1">
            <span className={labelClass}>Additional recipient emails</span>
            <textarea
              className={`${inputClass} min-h-[72px]`}
              value={secondaryRecipients}
              onChange={(event) => setSecondaryRecipients(event.target.value)}
              placeholder="compliance@company.com"
            />
            <span className="text-xs text-slate-500">Optional comma or newline separated emails.</span>
          </label>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={savingSettings}
              onClick={() => void handleSaveSettings()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {savingSettings ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Notification Settings
            </button>
            <button
              type="button"
              disabled={runningCheck}
              onClick={() => void handleRunCheck()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-800 hover:bg-orange-100 disabled:opacity-50"
            >
              {runningCheck ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              Run Expiry Check Now
            </button>
          </div>
        </aside>
      </div>

      {renewAlert ? (
        <AlertRenewModal
          alert={renewAlert}
          onClose={() => setRenewAlert(null)}
          onSaved={() => {
            setSuccessMessage("Record updated. Alert cleared from the active list.");
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
