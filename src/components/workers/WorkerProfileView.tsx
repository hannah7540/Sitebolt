"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Camera,
  Loader2,
  Lock,
  Mail,
  Phone,
  Save,
} from "lucide-react";
import type { DbProject } from "@/lib/project-resolver";
import type { Worker, WorkerVoc } from "@/lib/supabase";
import {
  fetchWorkerVocs,
  getWorkerAssignedProjectIds,
  isWorkerRevoked,
  updateWorker,
  updateWorkerSecurityRole,
  updateWorkerStatusFromVocs,
} from "@/lib/supabase";
import { requestWorkerRevokeAccess } from "@/lib/worker-revoke-client";
import { setWorkerProjectAssignments } from "@/lib/project-assignments";
import {
  hydrateCardsVocsFromWorker,
  parseCardsVocs,
  serializeCardsVocs,
  splitWorkerName,
  type WorkerCardVocEntry,
} from "@/lib/worker-cards-vocs";
import { getVocDisplayTitle } from "@/lib/voc-utils";
import { buildWorkerFullName } from "@/lib/worker-utils";
import {
  assignDefaultPayRuleToWorker,
  resolvePayRuleTemplateNameForWorker,
  resolveTravelPayrollCategory,
} from "@/lib/worker-pay-rule-assignment";
import WorkerAssignedProjectsPicker from "@/components/organisation/WorkerAssignedProjectsPicker";
import WorkerCardsVocsEditor from "@/components/workers/WorkerCardsVocsEditor";
import StateRegionSelector from "@/components/workers/StateRegionSelector";
import WorkerInductionsTab from "@/components/workers/WorkerInductionsTab";
import WorkerPhotoEditModal from "@/components/workers/WorkerPhotoEditModal";
import WorkerProfileAvatar from "@/components/ui/WorkerProfileAvatar";
import WorkerStateRegionBadge from "@/components/workers/WorkerStateRegionBadge";
import WorkerApprenticeBadge from "@/components/workers/WorkerApprenticeBadge";
import WorkerCompanyVehicleFields from "@/components/workers/WorkerCompanyVehicleFields";
import WorkerSecurityRoleSelect from "@/components/workers/WorkerSecurityRoleSelect";
import { ResendInviteButton } from "@/components/workers/ResendInviteButton";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import {
  normalizeSecurityRole,
  type SecurityRole,
} from "@/lib/security-roles";
import { cn } from "@/lib/utils";
import { cardClass, inputClass, labelClass, sectionClass } from "@/lib/ui-classes";
import {
  normalizeWorkerStateRegion,
  type WorkerStateRegion,
} from "@/lib/worker-state-region";

type ProfileTab = "basic" | "cards" | "inductions" | "financial";

type AccountStatusOption = "active" | "pending_induction" | "Revoked";

const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Casual", "Contractor"] as const;

const TAB_ITEMS: Array<{ id: ProfileTab; label: string }> = [
  { id: "basic", label: "Basic Info" },
  { id: "cards", label: "CARDS / VOCs" },
  { id: "inductions", label: "Inductions" },
  { id: "financial", label: "Financial Information" },
];

interface WorkerProfileViewProps {
  worker: Worker;
  workers?: Worker[];
  initialVocs?: WorkerVoc[];
  projects: DbProject[];
  initialTab?: ProfileTab;
  lastSignInAt?: string | null;
  canAssignPayRules?: boolean;
  canManageWorkerRoles?: boolean;
  onBack: () => void;
  onWorkerUpdated: (worker: Worker) => void;
}

function WorkerProfileStatusBadge({ worker }: { worker: Worker }) {
  if (isWorkerRevoked(worker)) {
    return (
      <span className="rounded bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700">
        Revoked
      </span>
    );
  }

  const status = worker.status ?? "active";
  const styles: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-800",
    pending_induction: "bg-blue-100 text-blue-800",
    expired_ticket: "bg-red-100 text-red-800",
  };
  const label =
    status === "pending_induction"
      ? "Pending Induction"
      : status === "expired_ticket"
        ? "Non-Compliant"
        : "Active";

  return (
    <span className={cn("rounded px-2.5 py-1 text-xs font-bold", styles[status] ?? styles.active)}>
      {label}
    </span>
  );
}

function LockedField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <label className="block space-y-1">
      <span className={cn(labelClass, "flex items-center gap-1.5")}>
        {label}
        <Lock className="h-3 w-3 text-slate-400" aria-hidden />
      </span>
      <input className={cn(inputClass, "cursor-not-allowed bg-slate-50 text-slate-600")} value={value ?? ""} disabled readOnly />
    </label>
  );
}

export default function WorkerProfileView({
  worker,
  workers = [],
  initialVocs = [],
  projects,
  initialTab = "basic",
  lastSignInAt = null,
  canAssignPayRules = false,
  canManageWorkerRoles = false,
  onBack,
  onWorkerUpdated,
}: WorkerProfileViewProps) {
  const [currentWorker, setCurrentWorker] = useState(worker);
  const [tab, setTab] = useState<ProfileTab>(initialTab);
  const { toast, showSuccess, showError, dismissToast } = useFormToast();
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [vocs, setVocs] = useState<WorkerVoc[]>(initialVocs);
  const [loadingVocs, setLoadingVocs] = useState(initialVocs.length === 0);
  const [cardEntries, setCardEntries] = useState<WorkerCardVocEntry[]>(() =>
    hydrateCardsVocsFromWorker(worker, initialVocs).filter(
      (entry) => (entry.category as string) !== "site_induction"
    )
  );

  const visibleTabs = useMemo(
    () =>
      canAssignPayRules
        ? TAB_ITEMS
        : TAB_ITEMS.filter((item) => item.id !== "financial"),
    [canAssignPayRules]
  );

  useEffect(() => {
    if (!canAssignPayRules && tab === "financial") {
      setTab("basic");
    }
  }, [canAssignPayRules, tab]);

  useEffect(() => {
    setCurrentWorker(worker);
    setCardEntries(
      hydrateCardsVocsFromWorker(worker, vocs).filter(
        (entry) => (entry.category as string) !== "site_induction"
      )
    );
  }, [worker, vocs]);

  useEffect(() => {
    if (initialVocs.length > 0) {
      setVocs(initialVocs);
      setLoadingVocs(false);
      return;
    }
    let cancelled = false;
    fetchWorkerVocs(worker.id).then((rows) => {
      if (!cancelled) {
        setVocs(rows);
        setLoadingVocs(false);
        setCardEntries(
          hydrateCardsVocsFromWorker(worker, rows).filter(
            (entry) => (entry.category as string) !== "site_induction"
          )
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [worker.id, initialVocs, worker]);

  const patchWorker = (updated: Worker) => {
    setCurrentWorker(updated);
    onWorkerUpdated(updated);
  };

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-orange-600"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to worker directory
      </button>

      <div className="mb-6 flex flex-wrap items-start gap-4">
        <div className="relative shrink-0">
          <WorkerProfileAvatar
            photoUrl={currentWorker.photo_url}
            worker={currentWorker}
            displayName={currentWorker.full_name}
            size="lg"
            ringClassName="ring-2 ring-orange-200"
          />
          <button
            type="button"
            onClick={() => setShowPhotoModal(true)}
            className="absolute -bottom-1 -right-1 inline-flex h-8 w-8 items-center justify-center rounded-full border border-orange-200 bg-white text-orange-600 shadow-sm transition hover:border-orange-400 hover:bg-orange-50"
            aria-label="Edit profile photo"
          >
            <Camera className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{currentWorker.full_name}</h1>
            {currentWorker.is_apprentice ? (
              <WorkerApprenticeBadge className="px-2.5 py-1" />
            ) : null}
            <WorkerStateRegionBadge state={currentWorker.state} className="px-2.5 py-1" />
            <WorkerProfileStatusBadge worker={currentWorker} />
            <ResendInviteButton
              worker={currentWorker}
              lastSignInAt={lastSignInAt}
              label="Resend Invite Link"
              variant="profile"
              onSuccess={(message, inviteSentAt) => {
                showSuccess(message);
                if (inviteSentAt) {
                  patchWorker({ ...currentWorker, invite_sent_at: inviteSentAt });
                }
              }}
              onError={showError}
            />
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {currentWorker.trade || "No trade set"}
            {currentWorker.worker_code ? ` · Worker #${currentWorker.worker_code}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-600">
            {currentWorker.phone ? (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-4 w-4 text-slate-400" />
                {currentWorker.phone}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <Mail className="h-4 w-4 text-slate-400" />
              {currentWorker.email}
            </span>
          </div>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {visibleTabs.map((item) => (
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

      {tab === "basic" ? (
        <BasicInfoTab
          worker={currentWorker}
          projects={projects}
          canManageWorkerRoles={canManageWorkerRoles}
          onSaved={patchWorker}
        />
      ) : tab === "cards" ? (
        <CardsVocsTab
          worker={currentWorker}
          entries={cardEntries}
          loading={loadingVocs}
          onEntriesChange={setCardEntries}
          onSaved={patchWorker}
        />
      ) : tab === "inductions" ? (
        <WorkerInductionsTab
          worker={currentWorker}
          workers={workers.length > 0 ? workers : [currentWorker]}
          projects={projects}
        />
      ) : (
        <FinancialInfoTab
          worker={currentWorker}
          canAssignPayRules={canAssignPayRules}
          onSaved={patchWorker}
        />
      )}

      {showPhotoModal && (
        <WorkerPhotoEditModal
          workerId={currentWorker.id}
          currentPhotoUrl={currentWorker.photo_url}
          onClose={() => setShowPhotoModal(false)}
          onPhotoUpdated={(photoUrl) => {
            patchWorker({ ...currentWorker, photo_url: photoUrl });
          }}
        />
      )}

      {toast ? (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      ) : null}
    </div>
  );
}

function BasicInfoTab({
  worker,
  projects,
  canManageWorkerRoles,
  onSaved,
}: {
  worker: Worker;
  projects: DbProject[];
  canManageWorkerRoles: boolean;
  onSaved: (worker: Worker) => void;
}) {
  const nameParts = splitWorkerName(worker);
  const [firstName, setFirstName] = useState(nameParts.firstName);
  const [lastName, setLastName] = useState(nameParts.lastName);
  const [email, setEmail] = useState(worker.email);
  const [phone, setPhone] = useState(worker.phone ?? "");
  const [addressLine1, setAddressLine1] = useState(worker.address_line_1 ?? "");
  const [addressLine2, setAddressLine2] = useState(worker.address_line_2 ?? "");
  const [suburb, setSuburb] = useState(worker.suburb ?? "");
  const [postcode, setPostcode] = useState(worker.postcode ?? "");
  const [trade, setTrade] = useState(worker.trade ?? "");
  const [isApprentice, setIsApprentice] = useState(worker.is_apprentice ?? false);
  const [hasCompanyVehicle, setHasCompanyVehicle] = useState(
    worker.has_company_vehicle ?? false
  );
  const [assignedVehicleId, setAssignedVehicleId] = useState<string | null>(
    worker.assigned_vehicle_asset_id ?? null
  );
  const [state, setState] = useState<WorkerStateRegion | null>(
    normalizeWorkerStateRegion(worker.state)
  );
  const [workerCode, setWorkerCode] = useState(worker.worker_code ?? "");
  const [employmentType, setEmploymentType] = useState(worker.employment_type ?? "");
  const [accountStatus, setAccountStatus] = useState<AccountStatusOption>(() =>
    isWorkerRevoked(worker) ? "Revoked" : (worker.status as AccountStatusOption) ?? "active"
  );
  const [projectIds, setProjectIds] = useState<string[]>(() =>
    getWorkerAssignedProjectIds(worker)
  );
  const [securityRole, setSecurityRole] = useState<SecurityRole>(
    normalizeSecurityRole(worker.security_role)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const parts = splitWorkerName(worker);
    setFirstName(parts.firstName);
    setLastName(parts.lastName);
    setEmail(worker.email);
    setPhone(worker.phone ?? "");
    setAddressLine1(worker.address_line_1 ?? "");
    setAddressLine2(worker.address_line_2 ?? "");
    setSuburb(worker.suburb ?? "");
    setPostcode(worker.postcode ?? "");
    setTrade(worker.trade ?? "");
    setIsApprentice(worker.is_apprentice ?? false);
    setHasCompanyVehicle(worker.has_company_vehicle ?? false);
    setAssignedVehicleId(worker.assigned_vehicle_asset_id ?? null);
    setState(normalizeWorkerStateRegion(worker.state));
    setWorkerCode(worker.worker_code ?? "");
    setEmploymentType(worker.employment_type ?? "");
    setAccountStatus(
      isWorkerRevoked(worker) ? "Revoked" : (worker.status as AccountStatusOption) ?? "active"
    );
    setProjectIds(getWorkerAssignedProjectIds(worker));
    setSecurityRole(normalizeSecurityRole(worker.security_role));
  }, [worker]);

  const fullName = useMemo(
    () => buildWorkerFullName(firstName, lastName),
    [firstName, lastName]
  );

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError("First name, last name, and email are required.");
      return;
    }
    if (hasCompanyVehicle && !assignedVehicleId) {
      setError("Please select a company vehicle.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const wasRevoked = isWorkerRevoked(worker);
      const wantsRevoked = accountStatus === "Revoked";

      if (wantsRevoked !== wasRevoked) {
        const { error: revokeError } = await requestWorkerRevokeAccess(
          worker.id,
          wantsRevoked
        );
        if (revokeError) {
          setError(revokeError);
          return;
        }
      }

      const nextStatus =
        accountStatus === "Revoked"
          ? "Revoked"
          : accountStatus === "pending_induction"
            ? "pending_induction"
            : "active";

      const { error: updateError } = await updateWorker(worker.id, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        full_name: fullName,
        email: email.trim(),
        phone: phone.trim() || null,
        address_line_1: addressLine1.trim() || null,
        address_line_2: addressLine2.trim() || null,
        suburb: suburb.trim() || null,
        postcode: postcode.trim() || null,
        trade: trade.trim() || null,
        is_apprentice: isApprentice,
        has_company_vehicle: hasCompanyVehicle,
        assigned_vehicle_asset_id: hasCompanyVehicle ? assignedVehicleId : null,
        state,
        worker_code: workerCode.trim() || null,
        employment_type: employmentType.trim() || null,
        status: nextStatus,
      });

      if (updateError) {
        setError(updateError);
        return;
      }

      if (
        canManageWorkerRoles &&
        securityRole !== normalizeSecurityRole(worker.security_role)
      ) {
        const { error: roleError } = await updateWorkerSecurityRole(worker.id, securityRole);
        if (roleError) {
          setError(roleError);
          return;
        }
      }

      let resolvedPayRuleId =
        worker.pay_rule_id ?? worker.pay_rule_template_id ?? null;

      if (state) {
        const { templateId } = await assignDefaultPayRuleToWorker(
          worker.id,
          state,
          isApprentice
        );
        resolvedPayRuleId = templateId ?? resolvedPayRuleId;
      }

      const { error: assignError } = await setWorkerProjectAssignments(
        { ...worker, full_name: fullName },
        projectIds
      );

      if (assignError) {
        setError(assignError);
        return;
      }

      onSaved({
        ...worker,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        full_name: fullName,
        email: email.trim(),
        phone: phone.trim() || null,
        address_line_1: addressLine1.trim() || null,
        address_line_2: addressLine2.trim() || null,
        suburb: suburb.trim() || null,
        postcode: postcode.trim() || null,
        trade: trade.trim() || null,
        is_apprentice: isApprentice,
        has_company_vehicle: hasCompanyVehicle,
        assigned_vehicle_asset_id: hasCompanyVehicle ? assignedVehicleId : null,
        state,
        worker_code: workerCode.trim() || null,
        employment_type: employmentType.trim() || null,
        status: nextStatus,
        is_revoked: wantsRevoked,
        is_archived: wantsRevoked,
        assigned_project_ids: wantsRevoked ? [] : projectIds,
        assigned_project_id: wantsRevoked ? null : projectIds[0] ?? null,
        pay_rule_id: resolvedPayRuleId,
        pay_rule_template_id: resolvedPayRuleId,
        security_role: canManageWorkerRoles ? securityRole : worker.security_role,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn(sectionClass, "space-y-4")}>
      <p className="text-sm text-slate-500">
        Update contact details, employment information, project assignment, and account status.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className={labelClass}>First name *</span>
          <input className={inputClass} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className={labelClass}>Last name *</span>
          <input className={inputClass} value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className={labelClass}>Email</span>
          <input
            type="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className={labelClass}>Phone</span>
          <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="block space-y-1 sm:col-span-2">
          <span className={labelClass}>Address Line 1</span>
          <input
            className={inputClass}
            value={addressLine1}
            onChange={(e) => setAddressLine1(e.target.value)}
            autoComplete="address-line1"
          />
        </label>
        <label className="block space-y-1 sm:col-span-2">
          <span className={labelClass}>Address Line 2 (Optional)</span>
          <input
            className={inputClass}
            value={addressLine2}
            onChange={(e) => setAddressLine2(e.target.value)}
            autoComplete="address-line2"
          />
        </label>
        <label className="block space-y-1">
          <span className={labelClass}>Suburb / City</span>
          <input
            className={inputClass}
            value={suburb}
            onChange={(e) => setSuburb(e.target.value)}
            autoComplete="address-level2"
          />
        </label>
        <label className="block space-y-1">
          <span className={labelClass}>Postal / Zip Code</span>
          <input
            className={inputClass}
            value={postcode}
            onChange={(e) => setPostcode(e.target.value)}
            autoComplete="postal-code"
          />
        </label>
        <label className="block space-y-1">
          <span className={labelClass}>Role / trade</span>
          <input className={inputClass} value={trade} onChange={(e) => setTrade(e.target.value)} />
        </label>
        <div className="sm:col-span-2">
          <StateRegionSelector
            id={`worker-profile-state-${worker.id}`}
            value={state}
            onChange={setState}
            disabled={saving}
          />
        </div>
        <label className="flex items-center gap-2 sm:col-span-2">
          <input
            type="checkbox"
            checked={isApprentice}
            onChange={(event) => setIsApprentice(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
          />
          <span className={labelClass}>Apprentice? (Yes/No)</span>
        </label>
        <WorkerCompanyVehicleFields
          idPrefix="profile-company-vehicle"
          hasCompanyVehicle={hasCompanyVehicle}
          assignedVehicleId={assignedVehicleId}
          onHasCompanyVehicleChange={setHasCompanyVehicle}
          onAssignedVehicleChange={setAssignedVehicleId}
          disabled={saving}
        />
        <label className="block space-y-1">
          <span className={labelClass}>Worker code / number</span>
          <input
            className={inputClass}
            value={workerCode}
            onChange={(e) => setWorkerCode(e.target.value)}
            placeholder="e.g. W-1042"
          />
        </label>
        <label className="block space-y-1">
          <span className={labelClass}>Employment type</span>
          <select
            className={inputClass}
            value={employmentType}
            onChange={(e) => setEmploymentType(e.target.value)}
          >
            <option value="">Select type</option>
            {EMPLOYMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className={labelClass}>Account status</span>
          <select
            className={inputClass}
            value={accountStatus}
            onChange={(e) => setAccountStatus(e.target.value as AccountStatusOption)}
          >
            <option value="active">Active</option>
            <option value="pending_induction">Pending Induction</option>
            <option value="Revoked">Revoked</option>
          </select>
        </label>
        {canManageWorkerRoles ? (
          <WorkerSecurityRoleSelect
            id={`profile-security-role-${worker.id}`}
            value={securityRole}
            onChange={setSecurityRole}
            disabled={saving}
          />
        ) : null}
      </div>

      <div className="space-y-2">
        <span className={labelClass}>Assigned projects</span>
        <WorkerAssignedProjectsPicker
          projects={projects}
          selectedIds={projectIds}
          onChange={setProjectIds}
          disabled={accountStatus === "Revoked"}
          saving={saving}
        />
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={saving}
        onClick={() => void handleSave()}
        className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save basic info
      </button>
    </div>
  );
}

function CardsVocsTab({
  worker,
  entries,
  loading,
  onEntriesChange,
  onSaved,
}: {
  worker: Worker;
  entries: WorkerCardVocEntry[];
  loading: boolean;
  onEntriesChange: (entries: WorkerCardVocEntry[]) => void;
  onSaved: (worker: Worker) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const missingPlantVocType = entries.find(
        (entry) => entry.category === "plant_voc" && !getVocDisplayTitle({
          voc_type: entry.voc_type,
          title: entry.ticket_name,
        })
      );
      if (missingPlantVocType) {
        setError("Please select a VOC type for each Plant Operations VOC entry.");
        return;
      }

      const serialized = serializeCardsVocs(entries);
      const { error: updateError } = await updateWorker(worker.id, {
        cards_vocs: serialized,
      });

      if (updateError) {
        setError(updateError);
        return;
      }

      const { error: statusError } = await updateWorkerStatusFromVocs(
        worker.id,
        worker.drivers_licence_expiry,
        serialized
          .filter((entry) => entry.category !== "white_card")
          .map((entry) => entry.expiry_date)
      );
      if (statusError) {
        setError(statusError);
        return;
      }

      onSaved({
        ...worker,
        cards_vocs: serialized,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
        Loading tickets and VOCs…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Manage white cards, HRWL, plant VOCs, and first aid certificates.
      </p>

      <WorkerCardsVocsEditor
        workerId={worker.id}
        entries={entries}
        onChange={onEntriesChange}
      />

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={saving}
        onClick={() => void handleSave()}
        className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save CARDS / VOCs
      </button>
    </div>
  );
}

function FinancialInfoTab({
  worker,
  canAssignPayRules,
}: {
  worker: Worker;
  canAssignPayRules: boolean;
  onSaved: (worker: Worker) => void;
}) {
  const assignedRuleName = resolvePayRuleTemplateNameForWorker(worker.state);
  const travelCategory =
    worker.state === "NSW"
      ? resolveTravelPayrollCategory(worker.is_apprentice ?? false, worker.state)
      : null;

  return (
    <div className="space-y-4">
      {canAssignPayRules ? (
        <div className={cn(sectionClass, "space-y-3")}>
          <p className="text-sm font-semibold text-slate-900">Payroll rule assignment</p>
          <p className="text-xs text-slate-500">
            Pay rules are assigned automatically from the worker&apos;s state/region and apprentice
            status on the Basic Info tab.
          </p>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Assigned pay rule</dt>
              <dd className="font-semibold text-slate-900">
                {assignedRuleName ?? "Not assigned — set state/region on Basic Info"}
              </dd>
            </div>
            {travelCategory ? (
              <div>
                <dt className="text-slate-500">NSW travel export category</dt>
                <dd className="font-semibold text-slate-900">{travelCategory}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}

      <div className={cn(cardClass, "border-amber-200 bg-amber-50/60 p-4")}>
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
          <Lock className="h-4 w-4" />
          Managed via Worker Onboarding / Self-Service
        </p>
        <p className="mt-1 text-xs text-amber-800">
          Sensitive financial and personal details are read-only at the organisation admin level.
          Workers update these fields during onboarding or through their self-service portal.
        </p>
      </div>

      <div className={cn(sectionClass, "space-y-4")}>
        <p className="text-sm font-semibold text-slate-900">Bank details</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <LockedField label="Account name" value={worker.bank_name} />
          <LockedField label="BSB" value={worker.bank_bsb} />
          <LockedField label="Account number" value={worker.bank_account_number} />
        </div>
      </div>

      <div className={cn(sectionClass, "space-y-4")}>
        <p className="text-sm font-semibold text-slate-900">Tax information</p>
        <LockedField label="Tax File Number (TFN)" value={worker.tfn} />
      </div>

      <div className={cn(sectionClass, "space-y-4")}>
        <p className="text-sm font-semibold text-slate-900">Emergency contacts</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <LockedField label="Contact name" value={worker.emergency_contact_name} />
          <LockedField label="Phone number" value={worker.emergency_contact_phone} />
          <LockedField
            label="Relationship"
            value={worker.emergency_contact_relationship ?? worker.emergency_contact}
          />
        </div>
      </div>

      <div className={cn(sectionClass, "space-y-4")}>
        <p className="text-sm font-semibold text-slate-900">Superannuation fund</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <LockedField label="Fund name" value={worker.super_fund} />
          <LockedField label="Member number" value={worker.super_member_number} />
        </div>
      </div>

      <div className={cn(sectionClass, "space-y-4")}>
        <p className="text-sm font-semibold text-slate-900">Redundancy fund</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <LockedField label="Fund name" value={worker.redundancy_fund_name} />
          <LockedField label="Member number" value={worker.redundancy_member_number} />
        </div>
      </div>
    </div>
  );
}
