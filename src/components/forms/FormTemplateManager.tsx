"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Copy,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import Toast from "@/components/ui/Toast";
import ConfirmDeletionDialog from "@/components/ui/ConfirmDeletionDialog";
import { useFormToast } from "@/hooks/useFormToast";
import FormBuilderDrawer from "@/components/forms/FormBuilderDrawer";
import {
  CUSTOM_FORM_TARGET_KEYS,
  deleteCustomFormTemplate,
  duplicateCustomFormTemplate,
  fetchCustomFormTemplates,
  formatFormDate,
  saveCustomFormTemplate,
  templateTargetLabels,
  type CustomFormEntityType,
  type CustomFormTemplate,
  type CustomFormTemplateInput,
} from "@/lib/custom-forms";
import { cn } from "@/lib/utils";
import { cardClass, inputClass } from "@/lib/ui-classes";

const TARGET_FILTERS: Array<{ id: "all" | CustomFormEntityType; label: string }> = [
  { id: "all", label: "All targets" },
  { id: "project", label: "Project" },
  { id: "worker", label: "Worker" },
  { id: "plant", label: "Plant" },
  { id: "fleet", label: "Fleet" },
  { id: "asset", label: "Asset" },
];

export default function FormTemplateManager() {
  const { toast, showError, showSuccess, dismissToast } = useFormToast();
  const [templates, setTemplates] = useState<CustomFormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [targetFilter, setTargetFilter] = useState<"all" | CustomFormEntityType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<CustomFormTemplate | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [builderError, setBuilderError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CustomFormTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await fetchCustomFormTemplates();
    if (error) {
      setLoadError(error);
      setTemplates([]);
    } else {
      setTemplates(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return templates.filter((template) => {
      if (query && !template.title.toLowerCase().includes(query)) return false;
      if (statusFilter === "active" && !template.is_active) return false;
      if (statusFilter === "inactive" && template.is_active) return false;
      if (targetFilter !== "all") {
        const key = CUSTOM_FORM_TARGET_KEYS.find((item) => item.entity === targetFilter);
        if (key && !template[key.key]) return false;
      }
      return true;
    });
  }, [search, statusFilter, targetFilter, templates]);

  const openCreate = () => {
    setEditing(null);
    setReadOnly(false);
    setBuilderError(null);
    setBuilderOpen(true);
  };

  const openEdit = (template: CustomFormTemplate, viewOnly = false) => {
    setEditing(template);
    setReadOnly(viewOnly);
    setBuilderError(null);
    setBuilderOpen(true);
  };

  const handleSave = async (input: CustomFormTemplateInput) => {
    setSaving(true);
    setBuilderError(null);
    const { data, error } = await saveCustomFormTemplate(input, editing?.id ?? null);
    setSaving(false);
    if (error || !data) {
      setBuilderError(error ?? "Could not save template.");
      return;
    }
    setTemplates((current) => {
      const without = current.filter((item) => item.id !== data.id);
      return [data, ...without];
    });
    setBuilderOpen(false);
    setEditing(null);
    showSuccess(editing ? "Template updated." : "Template created.");
  };

  const handleDuplicate = async (template: CustomFormTemplate) => {
    const { data, error } = await duplicateCustomFormTemplate(template);
    if (error || !data) {
      showError(error ?? "Could not duplicate template.");
      return;
    }
    setTemplates((current) => [data, ...current]);
    showSuccess("Template duplicated.");
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const { error } = await deleteCustomFormTemplate(pendingDelete.id);
    setDeleting(false);
    if (error) {
      showError(error);
      return;
    }
    setTemplates((current) => current.filter((item) => item.id !== pendingDelete.id));
    setPendingDelete(null);
    showSuccess("Template deleted.");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Forms</h1>
          <p className="mt-1 text-sm text-slate-500">
            Build reusable templates and collect submissions across projects, people, plant, fleet, and assets.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
        >
          <Plus className="h-4 w-4" />
          Add New Form
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className={cn(inputClass, "pl-9")}
            placeholder="Search templates"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <select
          className={cn(inputClass, "max-w-[180px]")}
          value={targetFilter}
          onChange={(event) =>
            setTargetFilter(event.target.value as "all" | CustomFormEntityType)
          }
        >
          {TARGET_FILTERS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <select
          className={cn(inputClass, "max-w-[160px]")}
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(event.target.value as "all" | "active" | "inactive")
          }
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {loadError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {loadError}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading templates…
        </div>
      ) : filtered.length === 0 ? (
        <div className={cn(cardClass, "p-8 text-center text-sm text-slate-500")}>
          No form templates yet. Click Add New Form to create one.
        </div>
      ) : (
        <div className={cn(cardClass, "overflow-x-auto")}>
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Template Title</th>
                <th className="px-4 py-3">Targets</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((template) => (
                <tr key={template.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{template.title}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {templateTargetLabels(template).map((label) => (
                        <span
                          key={label}
                          className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700 ring-1 ring-orange-200"
                        >
                          {label}
                        </span>
                      ))}
                      {!templateTargetLabels(template).length ? (
                        <span className="text-slate-400">—</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-semibold",
                        template.is_active
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      )}
                    >
                      {template.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatFormDate(template.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(template, true)}
                        className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                        aria-label="View template"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(template)}
                        className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                        aria-label="Edit template"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDuplicate(template)}
                        className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                        aria-label="Duplicate template"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(template)}
                        className="rounded-md p-2 text-red-500 hover:bg-red-50"
                        aria-label="Delete template"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FormBuilderDrawer
        open={builderOpen}
        template={editing}
        readOnly={readOnly}
        saving={saving}
        error={builderError}
        onClose={() => {
          setBuilderOpen(false);
          setEditing(null);
        }}
        onSave={handleSave}
      />
      <ConfirmDeletionDialog
        open={Boolean(pendingDelete)}
        confirming={deleting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void handleDelete()}
      />
      {toast ? (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      ) : null}
    </div>
  );
}
