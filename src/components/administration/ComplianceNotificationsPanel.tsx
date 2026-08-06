"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  EXPIRY_ALERT_WINDOW_DAYS,
  fetchUpcomingExpiries,
  type UpcomingExpiryItem,
} from "@/lib/expiry-alerts";
import {
  fetchExpiryAlertSettings,
  formatSecondaryRecipientsForInput,
  parseSecondaryRecipientInput,
  saveExpiryAlertSettings,
} from "@/lib/expiry-alert-settings";
import type { ActiveView } from "@/components/Sidebar";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface ComplianceNotificationsPanelProps {
  onNavigate: (view: ActiveView) => void;
}

function daysBadgeClass(days: number): string {
  if (days <= 7) return "border-red-200 bg-red-50 text-red-700";
  if (days <= 14) return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-orange-200 bg-orange-50 text-orange-800";
}

export default function ComplianceNotificationsPanel({
  onNavigate,
}: ComplianceNotificationsPanelProps) {
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [runningCheck, setRunningCheck] = useState(false);
  const [notifyingWorkerId, setNotifyingWorkerId] = useState<string | null>(null);
  const [workerItems, setWorkerItems] = useState<
    Awaited<ReturnType<typeof fetchUpcomingExpiries>>["workerQualifications"]
  >([]);
  const [insuranceItems, setInsuranceItems] = useState<
    Awaited<ReturnType<typeof fetchUpcomingExpiries>>["insurances"]
  >([]);
  const [automatedEnabled, setAutomatedEnabled] = useState(true);
  const [secondaryRecipients, setSecondaryRecipients] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [summary, settings] = await Promise.all([
        fetchUpcomingExpiries(),
        fetchExpiryAlertSettings(),
      ]);
      setWorkerItems(summary.workerQualifications);
      setInsuranceItems(summary.insurances);
      setAutomatedEnabled(settings.automated_emails_enabled);
      setSecondaryRecipients(
        formatSecondaryRecipientsForInput(settings.secondary_recipient_emails)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load expiry alerts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const combinedItems: UpcomingExpiryItem[] = useMemo(
    () => [...workerItems, ...insuranceItems],
    [workerItems, insuranceItems]
  );

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    setError(null);
    setSuccessMessage(null);

    const { error: saveError } = await saveExpiryAlertSettings({
      automated_emails_enabled: automatedEnabled,
      secondary_recipient_emails: parseSecondaryRecipientInput(secondaryRecipients),
    });

    setSavingSettings(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    setSuccessMessage("Alert settings saved.");
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
        workerItemsIncluded?: number;
        insuranceItemsIncluded?: number;
        errors?: string[];
      };

      if (!response.ok) {
        setError(payload.error ?? "Expiry check failed.");
        return;
      }

      if (payload.skipped) {
        setSuccessMessage(payload.reason ?? "Expiry check skipped.");
      } else {
        setSuccessMessage(
          `Expiry check complete. ${payload.emailsSent ?? 0} email(s) sent (${payload.workerItemsIncluded ?? 0} worker items, ${payload.insuranceItemsIncluded ?? 0} insurance items).`
        );
      }

      if (payload.errors?.length) {
        setError(payload.errors.join(" "));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run expiry check.");
    } finally {
      setRunningCheck(false);
    }
  };

  const handleNotifyWorker = async (workerId: string) => {
    setNotifyingWorkerId(workerId);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/alerts/notify-worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerId }),
      });
      const payload = (await response.json()) as {
        error?: string;
        sent?: boolean;
        itemCount?: number;
      };

      if (!response.ok || payload.error) {
        setError(payload.error ?? "Failed to notify worker.");
        return;
      }

      setSuccessMessage(
        `Notification sent to worker (${payload.itemCount ?? 0} expiring item(s)).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to notify worker.");
    } finally {
      setNotifyingWorkerId(null);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">
          Compliance <span className="text-orange-500">/ Notifications</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          30-day expiry alerts for worker qualifications and company insurance policies.
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

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className={cn("flex items-center gap-4 p-5", cardClass)}>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Worker Qualifications</p>
            <p className="text-2xl font-bold text-slate-900">{workerItems.length}</p>
          </div>
        </div>
        <div className={cn("flex items-center gap-4 p-5", cardClass)}>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Insurance Policies</p>
            <p className="text-2xl font-bold text-slate-900">{insuranceItems.length}</p>
          </div>
        </div>
        <div className={cn("flex items-center gap-4 p-5", cardClass)}>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 text-red-600">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Total Upcoming ({EXPIRY_ALERT_WINDOW_DAYS}d)</p>
            <p className="text-2xl font-bold text-slate-900">{combinedItems.length}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className={cn("p-6", cardClass)}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">
              Upcoming Expiries (Next {EXPIRY_ALERT_WINDOW_DAYS} Days)
            </h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onNavigate("org-insurances")}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Renew Policies
              </button>
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
              Loading upcoming expiries…
            </div>
          ) : combinedItems.length === 0 ? (
            <p className="text-sm text-slate-600">
              No worker qualifications or insurance policies expiring in the next{" "}
              {EXPIRY_ALERT_WINDOW_DAYS} days.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-semibold">Type</th>
                    <th className="px-3 py-2 font-semibold">Name / Policy</th>
                    <th className="px-3 py-2 font-semibold">Document</th>
                    <th className="px-3 py-2 font-semibold">Expiry</th>
                    <th className="px-3 py-2 font-semibold">Days</th>
                    <th className="px-3 py-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {workerItems.map((item) => (
                    <tr key={item.entityKey} className="border-b border-slate-100">
                      <td className="px-3 py-3">Worker</td>
                      <td className="px-3 py-3 font-medium text-slate-900">{item.workerName}</td>
                      <td className="px-3 py-3">{item.documentType}</td>
                      <td className="px-3 py-3">{item.expiryDate}</td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-xs font-semibold",
                            daysBadgeClass(item.daysRemaining)
                          )}
                        >
                          {item.daysRemaining}d
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          disabled={notifyingWorkerId === item.workerId}
                          onClick={() => void handleNotifyWorker(item.workerId)}
                          className="inline-flex items-center gap-1 rounded-lg border border-orange-200 px-2.5 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-50 disabled:opacity-50"
                        >
                          {notifyingWorkerId === item.workerId ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Mail className="h-3.5 w-3.5" />
                          )}
                          Notify Worker
                        </button>
                      </td>
                    </tr>
                  ))}
                  {insuranceItems.map((item) => (
                    <tr key={item.entityKey} className="border-b border-slate-100">
                      <td className="px-3 py-3">Insurance</td>
                      <td className="px-3 py-3 font-medium text-slate-900">{item.policyName}</td>
                      <td className="px-3 py-3">{item.policyNumber ?? "—"}</td>
                      <td className="px-3 py-3">{item.expiryDate}</td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-xs font-semibold",
                            daysBadgeClass(item.daysRemaining)
                          )}
                        >
                          {item.daysRemaining}d
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => onNavigate("org-insurances")}
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Renew Policy
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
            <h2 className="font-semibold text-slate-900">Automated Email Alerts</h2>
            <p className="mt-1 text-xs text-slate-500">
              Daily digest emails to admin/full-access users. Duplicate entity alerts are
              suppressed for 7 days.
            </p>
          </div>

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
            <span className={labelClass}>Secondary recipient emails</span>
            <textarea
              className={`${inputClass} min-h-[88px]`}
              value={secondaryRecipients}
              onChange={(event) => setSecondaryRecipients(event.target.value)}
              placeholder="compliance@company.com, safety@company.com"
            />
            <span className="text-xs text-slate-500">Comma or newline separated.</span>
          </label>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={savingSettings}
              onClick={() => void handleSaveSettings()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {savingSettings ? "Saving…" : "Save Settings"}
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

          <p className="text-xs leading-relaxed text-slate-500">
            Schedule a daily cron hit to{" "}
            <code className="rounded bg-slate-100 px-1">/api/alerts/check-expiries</code> with
            header <code className="rounded bg-slate-100 px-1">Authorization: Bearer CRON_SECRET</code>.
            Configure <code className="rounded bg-slate-100 px-1">RESEND_API_KEY</code> for live
            email delivery.
          </p>
        </aside>
      </div>
    </div>
  );
}
