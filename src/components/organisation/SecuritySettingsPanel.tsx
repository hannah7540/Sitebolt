"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Shield } from "lucide-react";
import type { Worker } from "@/lib/supabase";
import {
  fetchAllWorkers,
  getWorkerAssignedProjectIds,
  updateWorkerAssignedProjectIds,
  updateWorkerSecurityRole,
  updateWorkerAccountsAccess,
} from "@/lib/supabase";
import { fetchProjects, type DbProject } from "@/lib/project-resolver";
import WorkerAssignedProjectsPicker from "./WorkerAssignedProjectsPicker";
import {
  SECURITY_ROLES,
  SECURITY_ROLE_LABELS,
  SECURITY_ROLE_DESCRIPTIONS,
  ACCOUNTS_ACCESS_ROLES,
  ACCOUNTS_ACCESS_ROLE_LABELS,
  ACCOUNTS_ACCESS_ROLE_DESCRIPTIONS,
  normalizeSecurityRole,
  normalizeAccountsAccessRole,
  type SecurityRole,
  type AccountsAccessRole,
} from "@/lib/security-roles";
import { cn } from "@/lib/utils";
import { cardClass, inputClass } from "@/lib/ui-classes";

interface SecuritySettingsPanelProps {
  onUpdated: () => void;
}

export default function SecuritySettingsPanel({
  onUpdated,
}: SecuritySettingsPanelProps) {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [projects, setProjects] = useState<DbProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const [savingAccountsId, setSavingAccountsId] = useState<string | null>(null);
  const [savingProjectsId, setSavingProjectsId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);

  const loadWorkers = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    const [{ workers: rows, error }, projectRows] = await Promise.all([
      fetchAllWorkers(),
      fetchProjects(),
    ]);

    setWorkers(rows);
    setProjects(projectRows);
    setFetchError(error);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadWorkers();
  }, [loadWorkers]);

  const reportSuccess = (text: string) => {
    setMessage(text);
    setMessageIsError(false);
  };

  const reportError = (text: string) => {
    setMessage(text);
    setMessageIsError(true);
  };

  const handleRoleChange = async (workerId: string, role: SecurityRole) => {
    setSavingRoleId(workerId);
    setMessage(null);
    setMessageIsError(false);

    try {
      const normalizedRole = normalizeSecurityRole(role);
      const { error } = await updateWorkerSecurityRole(workerId, normalizedRole);
      if (error) {
        reportError(error);
        return;
      }
      reportSuccess(`Updated ${SECURITY_ROLE_LABELS[normalizedRole]} for worker.`);
      await loadWorkers();
      onUpdated();
    } catch (err) {
      reportError(
        err instanceof Error
          ? err.message
          : "Failed to update security role. Please try again."
      );
    } finally {
      setSavingRoleId(null);
    }
  };

  const handleAccountsAccessChange = async (
    workerId: string,
    role: AccountsAccessRole
  ) => {
    setSavingAccountsId(workerId);
    setMessage(null);
    setMessageIsError(false);

    try {
      const normalizedRole = normalizeAccountsAccessRole(role);
      const { error } = await updateWorkerAccountsAccess(workerId, normalizedRole);
      if (error) {
        reportError(error);
        return;
      }
      reportSuccess(
        `Updated Accounts Access to ${ACCOUNTS_ACCESS_ROLE_LABELS[normalizedRole]}.`
      );
      await loadWorkers();
      onUpdated();
    } catch (err) {
      reportError(
        err instanceof Error
          ? err.message
          : "Failed to update accounts access. Please try again."
      );
    } finally {
      setSavingAccountsId(null);
    }
  };

  const handleProjectsChange = async (workerId: string, projectIds: string[]) => {
    setSavingProjectsId(workerId);
    setMessage(null);
    setMessageIsError(false);

    setWorkers((prev) =>
      prev.map((worker) =>
        worker.id === workerId
          ? { ...worker, assigned_project_ids: projectIds }
          : worker
      )
    );

    try {
      const { error } = await updateWorkerAssignedProjectIds(workerId, projectIds);
      if (error) {
        reportError(error);
        await loadWorkers();
        return;
      }
      reportSuccess("Assigned projects updated.");
      await loadWorkers();
      onUpdated();
    } catch (err) {
      reportError(
        err instanceof Error
          ? err.message
          : "Failed to update assigned projects. Please try again."
      );
      await loadWorkers();
    } finally {
      setSavingProjectsId(null);
    }
  };

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-slate-900">
        Security <span className="text-orange-500">Settings</span>
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        Assign access tiers and project access linked to each worker profile.
      </p>

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        {SECURITY_ROLES.map((role) => (
          <div key={role} className={cn(cardClass, "p-4")}>
            <div className="mb-2 flex items-center gap-2 text-orange-600">
              <Shield className="h-4 w-4" />
              <p className="font-semibold text-slate-900">
                {SECURITY_ROLE_LABELS[role]}
              </p>
            </div>
            <p className="text-xs text-slate-500">
              {SECURITY_ROLE_DESCRIPTIONS[role]}
            </p>
          </div>
        ))}
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        {ACCOUNTS_ACCESS_ROLES.map((role) => (
          <div key={role} className={cn(cardClass, "p-4")}>
            <div className="mb-2 flex items-center gap-2 text-orange-600">
              <Shield className="h-4 w-4" />
              <p className="font-semibold text-slate-900">
                Accounts: {ACCOUNTS_ACCESS_ROLE_LABELS[role]}
              </p>
            </div>
            <p className="text-xs text-slate-500">
              {ACCOUNTS_ACCESS_ROLE_DESCRIPTIONS[role]}
            </p>
          </div>
        ))}
      </div>

      {fetchError && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {fetchError}
        </p>
      )}

      {message && (
        <p
          role="alert"
          className={cn(
            "mb-4 rounded-lg border px-3 py-2 text-sm",
            messageIsError
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          )}
        >
          {message}
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading workers…
        </div>
      ) : fetchError ? null : workers.length === 0 ? (
        <p className={`p-6 text-sm text-slate-500 ${cardClass}`}>
          No workers found in the directory.
        </p>
      ) : (
        <div className={`overflow-x-auto ${cardClass}`}>
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Worker</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Access role</th>
                <th className="px-4 py-3">Accounts access</th>
                <th className="min-w-[14rem] px-4 py-3">Assigned projects</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((worker) => {
                const assignedIds = getWorkerAssignedProjectIds(worker);
                return (
                  <tr
                    key={worker.id}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {worker.full_name}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{worker.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <select
                          className={inputClass}
                          value={normalizeSecurityRole(worker.security_role)}
                          onChange={(e) =>
                            handleRoleChange(
                              worker.id,
                              normalizeSecurityRole(e.target.value)
                            )
                          }
                          disabled={savingRoleId === worker.id}
                        >
                          {SECURITY_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {SECURITY_ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                        {savingRoleId === worker.id && (
                          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <select
                          className={inputClass}
                          value={normalizeAccountsAccessRole(worker.accounts_access_role)}
                          onChange={(e) =>
                            handleAccountsAccessChange(
                              worker.id,
                              normalizeAccountsAccessRole(e.target.value)
                            )
                          }
                          disabled={savingAccountsId === worker.id}
                        >
                          {ACCOUNTS_ACCESS_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {ACCOUNTS_ACCESS_ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                        {savingAccountsId === worker.id && (
                          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <WorkerAssignedProjectsPicker
                        projects={projects}
                        selectedIds={assignedIds}
                        onChange={(ids) => handleProjectsChange(worker.id, ids)}
                        disabled={savingProjectsId === worker.id}
                        saving={savingProjectsId === worker.id}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
