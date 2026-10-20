"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import Toast from "@/components/ui/Toast";
import ConfirmDeletionDialog from "@/components/ui/ConfirmDeletionDialog";
import { useFormToast } from "@/hooks/useFormToast";
import {
  createSupplierAccount,
  deleteSupplierAccount,
  fetchSupplierAccounts,
  filterSupplierAccountsByState,
  SUPPLIER_ACCOUNT_STATES,
  updateSupplierAccount,
  type SupplierAccount,
  type SupplierAccountStateFilter,
} from "@/lib/supplier-accounts";
import { cn } from "@/lib/utils";
import { cardClass, inputClass } from "@/lib/ui-classes";
import SupplierAccountFormModal from "./SupplierAccountFormModal";

function formatCreatedAt(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}

function formatCreditLimit(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 2,
  }).format(value);
}

export default function SupplierAccountsPanel() {
  const { toast, showError, showSuccess, dismissToast } = useFormToast();
  const [accounts, setAccounts] = useState<SupplierAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<SupplierAccountStateFilter>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [editingAccount, setEditingAccount] = useState<SupplierAccount | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<SupplierAccount | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { accounts: rows, error } = await fetchSupplierAccounts();
    if (error) {
      setLoadError(error);
      setAccounts([]);
    } else {
      setAccounts(rows);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredAccounts = useMemo(
    () => filterSupplierAccountsByState(accounts, stateFilter),
    [accounts, stateFilter]
  );

  const closeModal = () => {
    setShowAdd(false);
    setEditingAccount(null);
  };

  const handleDelete = async (account: SupplierAccount) => {
    setDeletingId(account.id);
    try {
      const { error } = await deleteSupplierAccount(account.id);
      if (error) {
        showError(error);
        return;
      }
      showSuccess("Supplier deleted");
      await load();
    } finally {
      setDeletingId(null);
    }
  };

  const modalOpen = showAdd || editingAccount !== null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Supplier <span className="text-orange-500">Accounts</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Store and manage trade supplier accounts by state or region.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingAccount(null);
            setShowAdd(true);
          }}
          className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
        >
          <Plus className="h-4 w-4" />
          Add New Supplier
        </button>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="tablist"
          aria-label="Filter by state"
          className="flex flex-wrap gap-2"
        >
          {(
            [
              { value: "all", label: "All" },
              ...SUPPLIER_ACCOUNT_STATES.map((state) => ({
                value: state,
                label: state,
              })),
            ] as const
          ).map((option) => {
            const selected = stateFilter === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setStateFilter(option.value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
                  selected
                    ? "border-orange-500 bg-orange-500 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-700"
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 sm:min-w-[220px]">
          <span className="shrink-0">State</span>
          <select
            className={cn(inputClass, "w-full")}
            value={stateFilter}
            onChange={(event) => {
              const value = event.target.value;
              setStateFilter(
                value === "all" ||
                  SUPPLIER_ACCOUNT_STATES.includes(
                    value as (typeof SUPPLIER_ACCOUNT_STATES)[number]
                  )
                  ? (value as SupplierAccountStateFilter)
                  : "all"
              );
            }}
            aria-label="Filter suppliers by state"
          >
            <option value="all">All states</option>
            {SUPPLIER_ACCOUNT_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading supplier accounts…
        </div>
      ) : loadError ? (
        <p className={`p-6 text-sm text-red-700 ${cardClass}`}>{loadError}</p>
      ) : filteredAccounts.length === 0 ? (
        <p className={`p-6 text-sm text-slate-500 ${cardClass}`}>
          {accounts.length === 0
            ? "No supplier accounts yet. Click Add New Supplier to create one."
            : `No supplier accounts in ${stateFilter === "all" ? "this filter" : stateFilter}.`}
        </p>
      ) : (
        <div className={cn(cardClass, "overflow-x-auto")}>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Contact Person</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">Credit Limit</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((account) => (
                <tr
                  key={account.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-orange-50/50"
                >
                  <td className="px-4 py-3 font-medium text-slate-900">{account.name}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {account.contact_person ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{account.email ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{account.phone ?? "—"}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-slate-600">
                    {account.description ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      {account.state}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatCreditLimit(account.credit_limit)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatCreatedAt(account.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingAccount(account)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-orange-700"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === account.id}
                        onClick={() => setAccountToDelete(account)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {deletingId === account.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen ? (
        <SupplierAccountFormModal
          account={editingAccount}
          onClose={closeModal}
          onSave={async (input) => {
            const result = editingAccount
              ? await updateSupplierAccount(editingAccount.id, input)
              : await createSupplierAccount(input);
            if (result.error) {
              showError(result.error);
              return { error: result.error };
            }
            const saved = result.account;
            if (saved) {
              setAccounts((prev) => {
                const next = prev.filter((row) => row.id !== saved.id);
                next.push(saved);
                return next.sort((a, b) => a.name.localeCompare(b.name));
              });
            }
            showSuccess(editingAccount ? "Supplier updated" : "Supplier added");
            await load();
            return { error: null };
          }}
        />
      ) : null}

      <ConfirmDeletionDialog
        open={accountToDelete !== null}
        confirming={Boolean(accountToDelete && deletingId === accountToDelete.id)}
        title="Delete supplier account"
        message={
          accountToDelete
            ? `Delete ${accountToDelete.name}? This cannot be undone.`
            : undefined
        }
        onCancel={() => setAccountToDelete(null)}
        onConfirm={async () => {
          if (!accountToDelete) return;
          await handleDelete(accountToDelete);
          setAccountToDelete(null);
        }}
      />

      {toast ? (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      ) : null}
    </div>
  );
}
