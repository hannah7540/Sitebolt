"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Loader2, Pencil, Plus, Save, Users } from "lucide-react";
import type { DbProject } from "@/lib/project-resolver";
import { getCachedProjects } from "@/lib/project-resolver";
import { getProjectName } from "@/lib/projects";
import { getInsuranceExpiryStatus } from "@/lib/insurance-utils";
import {
  fetchSubcontractorDocuments,
  fetchSubcontractorPlant,
  coerceSubcontractor,
  getSubcontractorContactName,
  getSubcontractorEmail,
  getSubcontractorPhone,
  getSubcontractorStatusLabel,
  getSubcontractorTrade,
  getSubcontractorDocumentUrl,
  insertSubcontractorDocument,
  isSubcontractorArchived,
  updateSubcontractor,
  type Subcontractor,
  type SubcontractorDocument,
  type SubcontractorPlant,
} from "@/lib/subcontractors";
import {
  assignWorkersToProject,
  fetchWorkersForSubcontractor,
  getWorkerAssignedProjectIds,
  type Worker,
} from "@/lib/supabase";
import {
  getSubcontractorWorkerDocumentCompliance,
  getSubcontractorWorkerDocumentWarnings,
  isSubcontractorWorkerMissingDocuments,
} from "@/lib/subcontractor-compliance";
import AddSubcontractorWorkerModal from "@/components/subcontractors/AddSubcontractorWorkerModal";
import AddSubcontractorPlantModal from "@/components/subcontractors/AddSubcontractorPlantModal";
import EditSubcontractorModal from "@/components/subcontractors/EditSubcontractorModal";
import {
  getSubcontractorPlantCategory,
  getSubcontractorPlantUnitReference,
  getSubcontractorPlantServiceHistoryUrl,
  getSubcontractorPlantRiskAssessmentUrl,
  getSubcontractorPlantSerialNumber,
  getSubcontractorPlantNotes,
} from "@/lib/subcontractor-plant-payload";
import { cn } from "@/lib/utils";
import { cardClass, inputClass, labelClass, sectionClass } from "@/lib/ui-classes";

type ProfileTab = "company" | "workers" | "plant";

interface SubcontractorProfileViewProps {
  subcontractor: Subcontractor;
  onBack: () => void;
  onRefresh: () => void;
  onSubcontractorUpdated?: (updated: Subcontractor) => void;
}

export default function SubcontractorProfileView({
  subcontractor,
  onBack,
  onRefresh,
  onSubcontractorUpdated,
}: SubcontractorProfileViewProps) {
  const [subbie, setSubbie] = useState(() => coerceSubcontractor(subcontractor));
  const [tab, setTab] = useState<ProfileTab>("company");
  const [documents, setDocuments] = useState<SubcontractorDocument[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [plant, setPlant] = useState<SubcontractorPlant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [projects] = useState<DbProject[]>(() => getCachedProjects());

  useEffect(() => {
    setSubbie(coerceSubcontractor(subcontractor));
  }, [subcontractor]);

  const load = useCallback(async () => {
    setLoading(true);
    const [docRows, workerRows, plantRows] = await Promise.all([
      fetchSubcontractorDocuments(subbie.id),
      fetchWorkersForSubcontractor(subbie.id),
      fetchSubcontractorPlant(subbie.id),
    ]);
    setDocuments(docRows);
    setWorkers(workerRows);
    setPlant(plantRows);
    setLoading(false);
  }, [subbie.id]);

  const refreshPlant = useCallback(async () => {
    const plantRows = await fetchSubcontractorPlant(subbie.id);
    setPlant(plantRows);
  }, [subbie.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubcontractorUpdated = (updated: Subcontractor) => {
    const next = coerceSubcontractor(updated);
    setSubbie(next);
    onSubcontractorUpdated?.(next);
    onRefresh();
  };

  const tabs: { id: ProfileTab; label: string }[] = [
    { id: "company", label: "Company Details" },
    { id: "workers", label: "Workers" },
    { id: "plant", label: "Plant" },
  ];

  const statusLabel = getSubcontractorStatusLabel(subbie);
  const archived = isSubcontractorArchived(subbie);

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-orange-600"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to all subcontractors
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{subbie.company_name}</h1>
            <span
              className={cn(
                "rounded px-2.5 py-1 text-xs font-bold",
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
          </div>
          {subbie.abn ? (
            <p className="mt-1 text-sm text-slate-600">ABN {subbie.abn}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setShowEditModal(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-orange-300 hover:text-orange-600"
        >
          <Pencil className="h-4 w-4" />
          Edit Company Details
        </button>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition",
              tab === item.id
                ? "bg-orange-500 text-white shadow-sm"
                : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-orange-50 hover:text-orange-600"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading profile…
        </div>
      ) : tab === "company" ? (
        <CompanyDetailsTab
          subcontractor={subbie}
          documents={documents}
          onRefresh={load}
          onUpdated={handleSubcontractorUpdated}
        />
      ) : tab === "workers" ? (
        <WorkersTab
          subcontractorId={subbie.id}
          workers={workers}
          projects={projects}
          onRefresh={() => {
            load();
            onRefresh();
          }}
        />
      ) : (
        <PlantTab
          subcontractorId={subbie.id}
          plant={plant}
          onRefresh={refreshPlant}
        />
      )}

      {showEditModal && (
        <EditSubcontractorModal
          subcontractor={subbie}
          onClose={() => setShowEditModal(false)}
          onSaved={handleSubcontractorUpdated}
        />
      )}
    </div>
  );
}

function CompanyDetailsTab({
  subcontractor,
  documents,
  onRefresh,
  onUpdated,
}: {
  subcontractor: Subcontractor;
  documents: SubcontractorDocument[];
  onRefresh: () => void;
  onUpdated: (updated: Subcontractor) => void;
}) {
  const subbie = coerceSubcontractor(subcontractor);
  const [address, setAddress] = useState(subbie.address);
  const [contactName, setContactName] = useState(subbie.contact_name);
  const [contactPhone, setContactPhone] = useState(subbie.contact_phone);
  const [contactEmail, setContactEmail] = useState(subbie.contact_email);
  const [tradeScope, setTradeScope] = useState(subbie.trade_type);
  const [notes, setNotes] = useState(subbie.notes);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setAddress(subbie.address);
    setContactName(subbie.contact_name);
    setContactPhone(subbie.contact_phone);
    setContactEmail(subbie.contact_email);
    setTradeScope(subbie.trade_type);
    setNotes(subbie.notes);
  }, [subbie]);

  const saveInline = async (field: string) => {
    setSavingField(field);
    setSaveError(null);
    const { error } = await updateSubcontractor({
      id: subbie.id,
      address,
      contactName,
      contactPerson: contactName,
      contactPhone,
      phone: contactPhone,
      contactEmail,
      email: contactEmail,
      tradeType: tradeScope,
      tradeCategory: tradeScope,
      trade: tradeScope,
      notes,
    });
    setSavingField(null);
    if (error) {
      setSaveError(error);
      return;
    }
    onUpdated(
      coerceSubcontractor({
        ...subbie,
        address,
        contact_name: contactName,
        contact_person: contactName,
        contact_phone: contactPhone,
        phone: contactPhone,
        contact_email: contactEmail,
        email: contactEmail,
        trade_type: tradeScope,
        trade_category: tradeScope,
        trade: tradeScope,
        notes,
      })
    );
  };

  const insuranceDocuments = useMemo(
    () =>
      documents.filter((doc) =>
        /liability|insurance|workers comp|compensation/i.test(doc.document_type)
      ),
    [documents]
  );

  return (
    <div className="space-y-6">
      <div className={cn(sectionClass, "space-y-4")}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-900">Company information</p>
          <button
            type="button"
            disabled={savingField === "all"}
            onClick={() => void saveInline("all")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {savingField === "all" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save changes
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1 sm:col-span-2">
            <span className={labelClass}>Company address</span>
            <input
              className={inputClass}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>Primary contact name</span>
            <input
              className={inputClass}
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>Phone</span>
            <input
              className={inputClass}
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
            />
          </label>
          <label className="block space-y-1 sm:col-span-2">
            <span className={labelClass}>Email</span>
            <input
              type="email"
              className={inputClass}
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
          </label>
          <label className="block space-y-1 sm:col-span-2">
            <span className={labelClass}>Trade scope</span>
            <input
              className={inputClass}
              value={tradeScope}
              onChange={(e) => setTradeScope(e.target.value)}
              placeholder={getSubcontractorTrade(subbie)}
            />
          </label>
          <label className="block space-y-1 sm:col-span-2">
            <span className={labelClass}>Notes</span>
            <textarea
              className={`${inputClass} min-h-[72px] resize-y`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </div>

        {saveError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {saveError}
          </p>
        )}
      </div>

      <InsuranceSection
        subcontractorId={subbie.id}
        documents={insuranceDocuments.length > 0 ? insuranceDocuments : documents}
        onRefresh={onRefresh}
      />
    </div>
  );
}

function InsuranceSection({
  subcontractorId,
  documents,
  onRefresh,
}: {
  subcontractorId: string;
  documents: SubcontractorDocument[];
  onRefresh: () => void;
}) {
  const [documentType, setDocumentType] = useState("Public Liability");
  const [title, setTitle] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await insertSubcontractorDocument({
      subcontractorId,
      documentType,
      title,
      expiryDate: expiryDate || null,
    });
    setSaving(false);
    if (!error) {
      setTitle("");
      setExpiryDate("");
      onRefresh();
    }
  };

  return (
    <div className="space-y-4">
      <div className={cn(sectionClass, "space-y-3")}>
        <p className="text-sm font-semibold text-slate-900">Insurance details</p>
        <p className="text-xs text-slate-500">
          Public liability, workers compensation, and other compliance documents.
        </p>

        {documents.length === 0 ? (
          <p className="text-sm text-slate-500">No insurance documents recorded.</p>
        ) : (
          <ul className="space-y-3">
            {documents.map((doc) => {
              const expiry = getInsuranceExpiryStatus(doc.expiry_date);
              const documentUrl = getSubcontractorDocumentUrl(doc);
              return (
                <li key={doc.id} className={cn(cardClass, "p-4")}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">{doc.document_type}</p>
                      <p className="text-sm text-slate-500">{doc.title || "—"}</p>
                      <p className="text-sm text-slate-500">
                        Expires: {doc.expiry_date ?? "Not set"}
                      </p>
                      {documentUrl ? (
                        <a
                          href={documentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block text-sm font-medium text-orange-600 hover:underline"
                        >
                          View document
                        </a>
                      ) : null}
                    </div>
                    <span className={cn("rounded px-2 py-0.5 text-xs font-bold", expiry.badgeClass)}>
                      {expiry.label}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <form onSubmit={handleAdd} className={cn(sectionClass, "space-y-3")}>
        <p className="text-sm font-semibold text-slate-900">Add insurance document</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className={labelClass}>Document type</span>
            <select
              className={inputClass}
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
            >
              <option>Public Liability</option>
              <option>Workers Comp</option>
              <option>SWMS</option>
              <option>Safety Policy</option>
              <option>Other</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>Title</span>
            <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>Expiry date</span>
            <input
              type="date"
              className={inputClass}
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add document
        </button>
      </form>
    </div>
  );
}

function WorkersTab({
  subcontractorId,
  workers,
  projects,
  onRefresh,
}: {
  subcontractorId: string;
  workers: Worker[];
  projects: DbProject[];
  onRefresh: () => void;
}) {
  const [showAddModal, setShowAddModal] = useState(false);

  return (
    <div className="space-y-6">
      <BulkAllocationTool workers={workers} projects={projects} onAssigned={onRefresh} />

      <div className={cn(sectionClass, "flex flex-wrap items-center justify-between gap-3")}>
        <div>
          <p className="text-sm font-semibold text-slate-900">Workers</p>
          <p className="text-xs text-slate-500">
            All workers belonging to this subcontractor company.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
        >
          <Plus className="h-4 w-4" />
          Add Subbie Worker
        </button>
      </div>

      {workers.length === 0 ? (
        <p className={`p-6 text-sm text-slate-500 ${cardClass}`}>No subbie workers registered yet.</p>
      ) : (
        <div className={`overflow-x-auto ${cardClass}`}>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-orange-50/50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Compliance</th>
                <th className="px-4 py-3">Assigned projects</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((worker) => {
                const compliance = getSubcontractorWorkerDocumentCompliance(worker);
                const projectLabels = getWorkerAssignedProjectIds(worker).map(
                  (id) => getProjectName(id) || id.slice(0, 8)
                );
                return (
                  <tr key={worker.id} className="border-b border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">{worker.full_name}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{worker.phone || "—"}</div>
                      <div className="text-xs text-slate-500">{worker.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "rounded px-2 py-0.5 text-xs font-bold",
                          compliance.status === "valid" && "bg-emerald-100 text-emerald-800",
                          compliance.status === "missing_documents" &&
                            "bg-amber-100 text-amber-800"
                        )}
                        title={
                          compliance.missing.length > 0
                            ? compliance.missing.join(", ")
                            : undefined
                        }
                      >
                        {compliance.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {projectLabels.length > 0 ? projectLabels.join(", ") : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <AddSubcontractorWorkerModal
          subcontractorId={subcontractorId}
          onClose={() => setShowAddModal(false)}
          onSaved={onRefresh}
        />
      )}
    </div>
  );
}

function BulkAllocationTool({
  workers,
  projects,
  onAssigned,
}: {
  workers: Worker[];
  projects: DbProject[];
  onAssigned: () => void;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const warnings = useMemo(() => {
    const list: string[] = [];
    for (const id of selectedIds) {
      const worker = workers.find((w) => w.id === id);
      if (worker) {
        list.push(...getSubcontractorWorkerDocumentWarnings(worker));
      }
    }
    return list;
  }, [selectedIds, workers]);

  const toggleWorker = (workerId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(workerId)) next.delete(workerId);
      else next.add(workerId);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(workers.map((w) => w.id)));
  };

  const handleAssign = async () => {
    if (!projectId || selectedIds.size === 0) {
      setError("Select a project and at least one worker.");
      return;
    }
    setAssigning(true);
    setError(null);
    setSuccess(null);
    const { error: assignError } = await assignWorkersToProject(
      Array.from(selectedIds),
      projectId
    );
    setAssigning(false);
    if (assignError) {
      setError(assignError);
      return;
    }
    setSuccess(
      `Assigned ${selectedIds.size} worker${selectedIds.size === 1 ? "" : "s"} to ${getProjectName(projectId) || "project"}.`
    );
    setSelectedIds(new Set());
    onAssigned();
  };

  if (workers.length === 0) return null;

  return (
    <div className={cn(cardClass, "border-orange-200 bg-orange-50/30 p-5")}>
      <div className="mb-3 flex items-center gap-2">
        <Users className="h-5 w-5 text-orange-600" />
        <h3 className="font-semibold text-slate-900">1-Click Bulk Allocation</h3>
      </div>
      <p className="mb-4 text-sm text-slate-600">
        Assign multiple subbie workers to a project in one step. Workers with missing compliance
        documents are flagged before you assign.
      </p>

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="block space-y-1">
          <span className={labelClass}>Target project</span>
          <select
            className={inputClass}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={selectAll}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-orange-300"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={handleAssign}
            disabled={assigning || selectedIds.size === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {assigning && <Loader2 className="h-4 w-4 animate-spin" />}
            Assign to project
          </button>
        </div>
      </div>

      <ul className="space-y-2">
        {workers.map((worker) => {
          const missingDocs = isSubcontractorWorkerMissingDocuments(worker);
          const compliance = getSubcontractorWorkerDocumentCompliance(worker);
          const checked = selectedIds.has(worker.id);
          return (
            <li
              key={worker.id}
              className={cn(
                "rounded-lg border bg-white px-3 py-2",
                checked ? "border-orange-300" : "border-slate-200",
                missingDocs && "border-amber-200 bg-amber-50/40"
              )}
            >
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm font-medium text-slate-900">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleWorker(worker.id)}
                    className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                  />
                  {worker.full_name}
                </span>
                <span
                  className={cn(
                    "rounded px-2 py-0.5 text-xs font-bold",
                    compliance.status === "valid" && "bg-emerald-100 text-emerald-800",
                    compliance.status === "missing_documents" && "bg-amber-100 text-amber-800"
                  )}
                >
                  {compliance.label}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {warnings.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="mb-1 flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            Document compliance warnings
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {success && (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {success}
        </p>
      )}
    </div>
  );
}

function PlantTab({
  subcontractorId,
  plant,
  onRefresh,
}: {
  subcontractorId: string;
  plant: SubcontractorPlant[];
  onRefresh: () => void | Promise<void>;
}) {
  const [showAddModal, setShowAddModal] = useState(false);

  const handlePlantSaved = async () => {
    await onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className={cn(sectionClass, "flex flex-wrap items-center justify-between gap-3")}>
        <div>
          <p className="text-sm font-semibold text-slate-900">Plant</p>
          <p className="text-xs text-slate-500">
            Machinery and plant equipment supplied by this subcontractor.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
        >
          <Plus className="h-4 w-4" />
          Add Subbie Plant
        </button>
      </div>

      {plant.length === 0 ? (
        <p className={`p-6 text-sm text-slate-500 ${cardClass}`}>No subbie plant registered yet.</p>
      ) : (
        <div className={`overflow-x-auto ${cardClass}`}>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-orange-50/50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Make / Model</th>
                <th className="px-4 py-3">Hours</th>
                <th className="px-4 py-3">Documents</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {plant.map((item) => {
                const categoryLabel = getSubcontractorPlantCategory(item) || "—";
                const plantNotes = getSubcontractorPlantNotes(item);
                const hasServiceDoc = Boolean(getSubcontractorPlantServiceHistoryUrl(item)?.trim());
                const hasRiskDoc = Boolean(getSubcontractorPlantRiskAssessmentUrl(item)?.trim());
                return (
                  <tr key={item.id} className="border-b border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {getSubcontractorPlantUnitReference(item)}
                      {getSubcontractorPlantSerialNumber(item) ? (
                        <div className="text-xs font-normal text-slate-500">
                          S/N {getSubcontractorPlantSerialNumber(item)}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{categoryLabel}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {[item.make, item.model].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{item.current_hours ?? 0} hrs</div>
                      <div className="text-xs text-slate-500">
                        Next svc {item.next_service_hours ?? 0} hrs
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <span
                          className={cn(
                            "rounded px-2 py-0.5 text-xs font-medium",
                            hasServiceDoc
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-100 text-slate-600"
                          )}
                        >
                          Service history
                        </span>
                        <span
                          className={cn(
                            "rounded px-2 py-0.5 text-xs font-medium",
                            hasRiskDoc
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-100 text-slate-600"
                          )}
                        >
                          Risk assessment
                        </span>
                      </div>
                    </td>
                    <td className="max-w-[200px] px-4 py-3 text-slate-600">
                      {plantNotes ? (
                        <span className="line-clamp-2" title={plantNotes}>
                          {plantNotes}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 capitalize text-slate-600">{item.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <AddSubcontractorPlantModal
          subcontractorId={subcontractorId}
          onClose={() => setShowAddModal(false)}
          onSaved={handlePlantSaved}
        />
      )}
    </div>
  );
}
