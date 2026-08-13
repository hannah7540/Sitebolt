"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import type { Worker } from "@/lib/supabase";
import { updateWorker, updateWorkerPhotoUrl, updateWorkerSecurityRole } from "@/lib/supabase";
import { assignDefaultPayRuleToWorker, assignPayRuleToWorker } from "@/lib/worker-pay-rule-assignment";
import {
  normalizeSecurityRole,
  type SecurityRole,
} from "@/lib/security-roles";
import { uploadImageAndGetUrl } from "@/lib/worker-image-upload";
import { splitWorkerName } from "@/lib/worker-cards-vocs";
import { buildWorkerFullName, nullIfBlankWorkerDate } from "@/lib/worker-utils";
import {
  modalOverlayClass,
  modalClass,
  inputClass,
  labelClass,
  sectionClass,
} from "@/lib/ui-classes";
import { cn } from "@/lib/utils";
import WorkerCompanyVehicleFields from "./WorkerCompanyVehicleFields";
import AssignPayRuleSelect from "./AssignPayRuleSelect";
import WorkerSecurityRoleSelect from "./WorkerSecurityRoleSelect";

interface WorkerEditModalProps {
  worker: Worker;
  onClose: () => void;
  onSaved: (worker: Worker) => void;
  canManageWorkerRoles?: boolean;
  canAssignPayRules?: boolean;
}

export default function WorkerEditModal({
  worker,
  onClose,
  onSaved,
  canManageWorkerRoles = false,
  canAssignPayRules = false,
}: WorkerEditModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialNames = splitWorkerName(worker);
  const [firstName, setFirstName] = useState(initialNames.firstName);
  const [lastName, setLastName] = useState(initialNames.lastName);
  const [email, setEmail] = useState(worker.email);
  const [phone, setPhone] = useState(worker.phone ?? "");
  const [trade, setTrade] = useState(worker.trade ?? "");
  const [isApprentice, setIsApprentice] = useState(worker.is_apprentice ?? false);
  const [hasCompanyVehicle, setHasCompanyVehicle] = useState(
    worker.has_company_vehicle ?? false
  );
  const [assignedVehicleId, setAssignedVehicleId] = useState<string | null>(
    worker.assigned_vehicle_asset_id ?? null
  );
  const [whiteCardNumber, setWhiteCardNumber] = useState(worker.white_card_number ?? "");
  const [driversLicenceNumber, setDriversLicenceNumber] = useState(
    worker.drivers_licence_number ?? ""
  );
  const [driversLicenceExpiry, setDriversLicenceExpiry] = useState(
    worker.drivers_licence_expiry ?? ""
  );
  const [silicaCertNumber, setSilicaCertNumber] = useState(worker.silica_cert_number ?? "");
  const [securityRole, setSecurityRole] = useState<SecurityRole>(
    normalizeSecurityRole(worker.security_role)
  );
  const [assignedPayRuleId, setAssignedPayRuleId] = useState<string | null>(
    worker.pay_rule_id ?? worker.pay_rule_template_id ?? null
  );
  const [photoUrl, setPhotoUrl] = useState(worker.photo_url);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePhotoSelected = async (file: File | null) => {
    if (!file) return;
    setUploadingPhoto(true);
    setError(null);

    const { url, error: uploadError } = await uploadImageAndGetUrl(
      file,
      `profiles/${worker.id}/${Date.now()}`
    );

    if (uploadError || !url) {
      setUploadingPhoto(false);
      setError(uploadError ?? "Photo upload failed.");
      return;
    }

    const { error: photoError } = await updateWorkerPhotoUrl(worker.id, url);
    setUploadingPhoto(false);

    if (photoError) {
      setError(photoError);
      return;
    }

    setPhotoUrl(url);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
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

    const { error: updateError } = await updateWorker(worker.id, {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim(),
      phone: phone.trim() || null,
      trade: trade.trim() || null,
      is_apprentice: isApprentice,
      has_company_vehicle: hasCompanyVehicle,
      assigned_vehicle_asset_id: hasCompanyVehicle ? assignedVehicleId : null,
      white_card_number: whiteCardNumber.trim() || null,
      drivers_licence_number: driversLicenceNumber.trim() || null,
      drivers_licence_expiry: nullIfBlankWorkerDate(driversLicenceExpiry),
      silica_cert_number: silicaCertNumber.trim() || null,
    });

    if (updateError) {
      setSaving(false);
      setError(updateError);
      return;
    }

    if (
      canManageWorkerRoles &&
      securityRole !== normalizeSecurityRole(worker.security_role)
    ) {
      const { error: roleError } = await updateWorkerSecurityRole(worker.id, securityRole);
      if (roleError) {
        setSaving(false);
        setError(roleError);
        return;
      }
    }

    let resolvedPayRuleId =
      worker.pay_rule_id ?? worker.pay_rule_template_id ?? null;

    if (worker.state) {
      if (canAssignPayRules && assignedPayRuleId) {
        const { error: payRuleError } = await assignPayRuleToWorker(
          worker.id,
          assignedPayRuleId
        );
        if (payRuleError) {
          setSaving(false);
          setError(payRuleError);
          return;
        }
        resolvedPayRuleId = assignedPayRuleId;
      } else {
        const { error: payRuleError, templateId } = await assignDefaultPayRuleToWorker(
          worker.id,
          worker.state,
          isApprentice
        );
        if (payRuleError) {
          setSaving(false);
          setError(payRuleError);
          return;
        }
        resolvedPayRuleId = templateId ?? resolvedPayRuleId;
      }
    }

    setSaving(false);

    onSaved({
      ...worker,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      full_name: buildWorkerFullName(firstName, lastName),
      email: email.trim(),
      phone: phone.trim() || null,
      trade: trade.trim() || null,
      is_apprentice: isApprentice,
      has_company_vehicle: hasCompanyVehicle,
      assigned_vehicle_asset_id: hasCompanyVehicle ? assignedVehicleId : null,
      white_card_number: whiteCardNumber.trim() || null,
      drivers_licence_number: driversLicenceNumber.trim() || null,
      drivers_licence_expiry: nullIfBlankWorkerDate(driversLicenceExpiry),
      silica_cert_number: silicaCertNumber.trim() || null,
      photo_url: photoUrl,
      security_role: canManageWorkerRoles ? securityRole : worker.security_role,
      pay_rule_id: resolvedPayRuleId,
      pay_rule_template_id: resolvedPayRuleId,
    });
    onClose();
  };

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={`${modalClass} max-h-[90vh] max-w-lg overflow-y-auto`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Edit Worker</h2>
            <p className="mt-1 text-sm text-slate-500">
              Update worker details, certifications, and profile photo.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
          <div className={sectionClass}>
            <p className="text-sm font-semibold text-slate-900">Profile photo</p>
            <div className="mt-3 flex items-center gap-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                className={cn(
                  "relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full",
                  "border-2 border-orange-200 bg-orange-50"
                )}
              >
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Camera className="h-5 w-5 text-orange-500" />
                )}
                {uploadingPhoto && (
                  <span className="absolute inset-0 flex items-center justify-center bg-white/80">
                    <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                  </span>
                )}
              </button>
              <button
                type="button"
                disabled={uploadingPhoto}
                onClick={() => fileInputRef.current?.click()}
                className="text-sm font-semibold text-orange-600 hover:text-orange-500"
              >
                Upload photo
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  event.target.value = "";
                  void handlePhotoSelected(file);
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className={labelClass}>First name</span>
              <input
                className={inputClass}
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                required
              />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Last name</span>
              <input
                className={inputClass}
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                required
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className={labelClass}>Email</span>
              <input
                type="email"
                className={inputClass}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Phone</span>
              <input
                className={inputClass}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className={labelClass}>Trade / role</span>
            <input
              className={inputClass}
              value={trade}
              onChange={(event) => setTrade(event.target.value)}
              placeholder="e.g. Electrician, Leading Hand"
            />
          </label>

          {canManageWorkerRoles ? (
            <WorkerSecurityRoleSelect
              id={`edit-worker-security-role-${worker.id}`}
              value={securityRole}
              onChange={setSecurityRole}
              disabled={saving || uploadingPhoto}
            />
          ) : null}

          {canAssignPayRules ? (
            <AssignPayRuleSelect
              id={`edit-worker-pay-rule-${worker.id}`}
              value={assignedPayRuleId}
              onChange={setAssignedPayRuleId}
              disabled={saving || uploadingPhoto}
            />
          ) : null}

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isApprentice}
              onChange={(event) => setIsApprentice(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
            />
            <span className={labelClass}>Apprentice? (Yes/No)</span>
          </label>

          <WorkerCompanyVehicleFields
            idPrefix="edit-worker-company-vehicle"
            hasCompanyVehicle={hasCompanyVehicle}
            assignedVehicleId={assignedVehicleId}
            onHasCompanyVehicleChange={setHasCompanyVehicle}
            onAssignedVehicleChange={setAssignedVehicleId}
            disabled={saving}
          />

          <div className={sectionClass}>
            <p className="text-sm font-semibold text-slate-900">Certifications</p>
            <div className="mt-3 space-y-3">
              <label className="block space-y-1">
                <span className={labelClass}>White card number</span>
                <input
                  className={inputClass}
                  value={whiteCardNumber}
                  onChange={(event) => setWhiteCardNumber(event.target.value)}
                />
              </label>
              <label className="block space-y-1">
                <span className={labelClass}>Driver licence number</span>
                <input
                  className={inputClass}
                  value={driversLicenceNumber}
                  onChange={(event) => setDriversLicenceNumber(event.target.value)}
                />
              </label>
              <label className="block space-y-1">
                <span className={labelClass}>Driver licence expiry</span>
                <input
                  type="date"
                  className={inputClass}
                  value={driversLicenceExpiry ?? ""}
                  onChange={(event) => setDriversLicenceExpiry(event.target.value)}
                />
              </label>
              <label className="block space-y-1">
                <span className={labelClass}>Silica cert number</span>
                <input
                  className={inputClass}
                  value={silicaCertNumber}
                  onChange={(event) => setSilicaCertNumber(event.target.value)}
                />
              </label>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving || uploadingPhoto}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 py-2.5 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Worker
          </button>
        </form>
      </div>
    </div>
  );
}
