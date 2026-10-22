"use client";

import { useEffect, useState } from "react";
import {
  dismissSubcontractorApprovedAlert,
  listSubcontractorApprovedAlerts,
} from "@/app/actions/resource-approvals";

export default function SubcontractorApprovalAlerts() {
  const [alerts, setAlerts] = useState<Array<{ id: string; message: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    void listSubcontractorApprovedAlerts()
      .then((rows) => {
        if (!cancelled) setAlerts(rows);
      })
      .catch(() => {
        if (!cancelled) setAlerts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2 border-b border-emerald-200 bg-emerald-50 px-4 py-3 sm:px-6">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="flex items-start justify-between gap-3 text-sm text-emerald-900"
        >
          <p>{alert.message}</p>
          <button
            type="button"
            className="shrink-0 text-xs font-semibold uppercase tracking-wide text-emerald-800 hover:underline"
            onClick={() => {
              setAlerts((current) => current.filter((row) => row.id !== alert.id));
              void dismissSubcontractorApprovedAlert(alert.id);
            }}
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
