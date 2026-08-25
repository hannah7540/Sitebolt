"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { DbProject } from "@/lib/project-resolver";
import type { Worker } from "@/lib/supabase";
import { fetchWorkersForProject } from "@/lib/supabase";
import {
  fetchIncidentProjectOptions,
  INCIDENT_TREATMENT_OPTIONS,
  workerOptionLabel,
  type IncidentTreatmentDetails,
} from "@/lib/incident-reports";
import {
  uploadIncidentMedicalCertificate,
  uploadIncidentSignature,
} from "@/lib/incident-report-upload";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import WorkerSearchSelect from "@/components/assets/WorkerSearchSelect";
import CameraCaptureInput from "@/components/workers/CameraCaptureInput";
import { StableSignaturePad } from "@/components/workers/StableSignaturePad";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import {
  inputClass,
  labelClass,
  modalClass,
  modalOverlayClass,
} from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface WorkerIncidentReportModalProps {
  worker: Worker;
  seedProjects?: DbProject[];
  defaultProjectId?: string | null;
  onClose: () => void;
  onSubmitted: () => void;
}

function toLocalDateTimeValue(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function YesNoToggle({
  id,
  label,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  label: string;
  value: boolean | null;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="rounded-xl border border-slate-200 px-3 py-3">
      <legend className="px-1 text-sm font-medium text-slate-800">{label}</legend>
      <div
        className="mt-2 grid grid-cols-2 gap-2"
        role="radiogroup"
        aria-label={label}
      >
        <button
          type="button"
          id={`${id}-yes`}
          role="radio"
          aria-checked={value === true}
          disabled={disabled}
          onClick={() => onChange(true)}
          className={cn(
            "rounded-lg border px-3 py-2.5 text-sm font-semibold transition",
            value === true
              ? "border-orange-500 bg-orange-500 text-white shadow-sm"
              : "border-slate-200 bg-white text-slate-700 hover:border-orange-300 hover:bg-orange-50",
            disabled && "cursor-not-allowed opacity-60"
          )}
        >
          Yes
        </button>
        <button
          type="button"
          id={`${id}-no`}
          role="radio"
          aria-checked={value === false}
          disabled={disabled}
          onClick={() => onChange(false)}
          className={cn(
            "rounded-lg border px-3 py-2.5 text-sm font-semibold transition",
            value === false
              ? "border-slate-700 bg-slate-800 text-white shadow-sm"
              : "border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50",
            disabled && "cursor-not-allowed opacity-60"
          )}
        >
          No
        </button>
      </div>
    </fieldset>
  );
}

export default function WorkerIncidentReportModal({
  worker,
  seedProjects = [],
  defaultProjectId,
  onClose,
  onSubmitted,
}: WorkerIncidentReportModalProps) {
  const { toast, showError, showSuccess, dismissToast } = useFormToast();
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [projectWorkers, setProjectWorkers] = useState<Worker[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingWorkers, setLoadingWorkers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [incidentDateTime, setIncidentDateTime] = useState(toLocalDateTimeValue());
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [injuredWorkerId, setInjuredWorkerId] = useState<string | null>(null);
  const [injuryDetails, setInjuryDetails] = useState("");
  const [treatmentDetails, setTreatmentDetails] =
    useState<IncidentTreatmentDetails>("None");
  const [treatingPersonId, setTreatingPersonId] = useState<string | null>(null);
  const [offsiteTreatmentLocation, setOffsiteTreatmentLocation] = useState("");
  const [whatOccurred, setWhatOccurred] = useState("");
  const [incidentLocationDetails, setIncidentLocationDetails] = useState("");
  const [treatmentGiven, setTreatmentGiven] = useState("");
  const [witnessIds, setWitnessIds] = useState<string[]>([]);
  const [immediateCorrectiveActionRequired, setImmediateCorrectiveActionRequired] =
    useState<boolean | null>(null);
  const [isNotifiableUnderWhs, setIsNotifiableUnderWhs] = useState<boolean | null>(null);
  const [whatCausedToGoWrong, setWhatCausedToGoWrong] = useState("");
  const [whatCouldHavePrevented, setWhatCouldHavePrevented] = useState("");
  const [recommendationsToPrevent, setRecommendationsToPrevent] = useState("");
  const [medicalUrls, setMedicalUrls] = useState<string[]>([]);
  const [uploadingMedical, setUploadingMedical] = useState(false);
  const [signature, setSignature] = useState("");

  const isOnsiteTreatment = treatmentDetails === "First Aid";
  const isOffsiteTreatment =
    treatmentDetails === "Doctor or Clinic" || treatmentDetails === "Hospital";

  useEffect(() => {
    let cancelled = false;
    async function loadProjects() {
      setLoadingProjects(true);
      try {
        const options = await fetchIncidentProjectOptions(seedProjects);
        if (cancelled) return;
        setProjects(options);
        setProjectId((current) => {
          if (current && options.some((row) => row.id === current)) return current;
          if (defaultProjectId && options.some((row) => row.id === defaultProjectId)) {
            return defaultProjectId;
          }
          return options[0]?.id ?? "";
        });
      } finally {
        if (!cancelled) setLoadingProjects(false);
      }
    }
    void loadProjects();
    return () => {
      cancelled = true;
    };
  }, [defaultProjectId, seedProjects]);

  useEffect(() => {
    let cancelled = false;
    async function loadWorkers() {
      if (!projectId) {
        setProjectWorkers([]);
        return;
      }
      setLoadingWorkers(true);
      try {
        const workers = await fetchWorkersForProject(projectId);
        if (cancelled) return;
        setProjectWorkers(workers);
        setInjuredWorkerId(null);
        setTreatingPersonId(null);
        setWitnessIds([]);
      } finally {
        if (!cancelled) setLoadingWorkers(false);
      }
    }
    void loadWorkers();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const selectedProject = useMemo(
    () => projects.find((row) => row.id === projectId) ?? null,
    [projects, projectId]
  );

  const handleMedicalFile = async (file: File | null) => {
    if (!file) return;
    setUploadingMedical(true);
    try {
      const result = await uploadIncidentMedicalCertificate(
        file,
        `${worker.id}-${Date.now()}`
      );
      if (!result.url) {
        const message = result.error ?? "Failed to upload medical certificate.";
        setError(message);
        showError(message);
        return;
      }
      setMedicalUrls((current) => [...current, result.url!]);
    } finally {
      setUploadingMedical(false);
    }
  };

  const handleFilePicker = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) await handleMedicalFile(file);
    event.target.value = "";
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!incidentDateTime) {
      setError("Date and time of incident is required.");
      return;
    }
    if (!projectId) {
      setError("Please select a project.");
      return;
    }
    if (!injuredWorkerId) {
      setError("Please search and select the injured worker.");
      return;
    }
    if (!whatOccurred.trim()) {
      setError("Please describe what occurred.");
      return;
    }
    if (!incidentLocationDetails.trim()) {
      setError("Please describe where the incident occurred.");
      return;
    }
    if (isOnsiteTreatment && !treatingPersonId) {
      setError("Select the treating person for onsite first aid.");
      return;
    }
    if (isOffsiteTreatment && !offsiteTreatmentLocation.trim()) {
      setError("Enter where offsite treatment was given.");
      return;
    }
    if (immediateCorrectiveActionRequired === null) {
      setError("Select Yes or No for immediate corrective action.");
      return;
    }
    if (isNotifiableUnderWhs === null) {
      setError("Select Yes or No for whether the incident is notifiable.");
      return;
    }
    if (!signature.trim()) {
      setError("Please sign the incident report.");
      return;
    }

    setSaving(true);
    try {
      const signatureUpload = await uploadIncidentSignature(
        signature,
        `${worker.id}-${Date.now()}`
      );
      if (!signatureUpload.url) {
        const message =
          signatureUpload.error ??
          "Failed to upload signature to incident-attachments.";
        setError(message);
        showError(message);
        setSaving(false);
        return;
      }

      const injured = projectWorkers.find((row) => row.id === injuredWorkerId);
      const treating = projectWorkers.find((row) => row.id === treatingPersonId);
      const witnesses = projectWorkers.filter((row) => witnessIds.includes(row.id));

      if (!injured) {
        setError("Selected injured worker is not assigned to this project.");
        setSaving(false);
        return;
      }

      const response = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submittedByName: getWorkerDisplayName(worker, "Worker"),
          incidentDateTime: new Date(incidentDateTime).toISOString(),
          projectId,
          projectName: selectedProject?.name ?? "Project",
          injuredWorkerId,
          injuredWorkerName: workerOptionLabel(injured),
          injuryDetails,
          treatmentDetails,
          treatingPersonId: isOnsiteTreatment ? treatingPersonId : null,
          treatingPersonName:
            isOnsiteTreatment && treating ? workerOptionLabel(treating) : null,
          offsiteTreatmentLocation: isOffsiteTreatment
            ? offsiteTreatmentLocation
            : null,
          whatOccurred,
          incidentLocationDetails,
          treatmentGiven,
          witnessIds,
          witnessNames: witnesses.map(workerOptionLabel),
          immediateCorrectiveActionRequired,
          isNotifiableUnderWhs,
          whatCausedToGoWrong,
          whatCouldHavePrevented,
          recommendationsToPrevent,
          medicalCertificateUrls: medicalUrls,
          submitterSignatureUrl: signatureUpload.url,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        hint?: string;
        report?: { reference_number?: string };
        emailSent?: boolean;
      } | null;

      if (!response.ok) {
        const message = [payload?.error, payload?.hint].filter(Boolean).join(" ")
          || "Failed to submit incident report.";
        setError(message);
        showError(message);
        return;
      }

      showSuccess(
        `Incident ${payload?.report?.reference_number ?? "report"} submitted successfully.`
      );
      onSubmitted();
      window.setTimeout(() => onClose(), 350);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Failed to submit incident report.";
      setError(message);
      showError(message);
    } finally {
      setSaving(false);
    }
  };

  const workersDisabled = !projectId || loadingWorkers || saving;

  return (
    <div className={modalOverlayClass}>
      <div className={cn(modalClass, "max-h-[92vh] max-w-3xl overflow-y-auto")}>
        {toast ? (
          <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
        ) : null}

        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white pb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Incident Report</h2>
            <p className="mt-1 text-sm text-slate-500">
              Complete all required fields. Project managers and administrators will be notified.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-5">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="incident-datetime">
                Date &amp; Time of Incident *
              </label>
              <input
                id="incident-datetime"
                type="datetime-local"
                value={incidentDateTime}
                onChange={(e) => setIncidentDateTime(e.target.value)}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="incident-project">
                Project *
              </label>
              <select
                id="incident-project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className={inputClass}
                disabled={loadingProjects}
                required
              >
                <option value="">Select project…</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Injury &amp; Treatment</h3>
            <WorkerSearchSelect
              id="injured-worker"
              mode="single"
              label="Details of injured worker"
              required
              workers={projectWorkers}
              selected={injuredWorkerId}
              onChange={setInjuredWorkerId}
              disabled={workersDisabled}
              allowClear
              placeholder={
                loadingWorkers
                  ? "Loading project workers…"
                  : projectId
                    ? "Search and select injured worker…"
                    : "Select a project first…"
              }
              searchPlaceholder="Search project workers by name or email…"
              getWorkerLabel={workerOptionLabel}
            />
            <div>
              <label className={labelClass} htmlFor="injury-details">
                Injury details
              </label>
              <textarea
                id="injury-details"
                value={injuryDetails}
                onChange={(e) => setInjuryDetails(e.target.value)}
                className={inputClass}
                rows={2}
                placeholder='e.g. "tripped on loose gravel"'
              />
            </div>
            <fieldset>
              <legend className={labelClass}>Treatment details *</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {INCIDENT_TREATMENT_OPTIONS.map((option) => (
                  <label
                    key={option}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <input
                      type="radio"
                      name="treatment"
                      checked={treatmentDetails === option}
                      onChange={() => setTreatmentDetails(option)}
                    />
                    {option}
                  </label>
                ))}
              </div>
            </fieldset>
            {isOnsiteTreatment ? (
              <WorkerSearchSelect
                id="treating-person"
                mode="single"
                label="Treating person (onsite)"
                required
                workers={projectWorkers}
                selected={treatingPersonId}
                onChange={setTreatingPersonId}
                disabled={workersDisabled}
                allowClear
                placeholder="Search and select treating person…"
                searchPlaceholder="Search project workers by name or email…"
                getWorkerLabel={workerOptionLabel}
              />
            ) : null}
            {isOffsiteTreatment ? (
              <div>
                <label className={labelClass} htmlFor="offsite-location">
                  Where was treatment given? *
                </label>
                <input
                  id="offsite-location"
                  value={offsiteTreatmentLocation}
                  onChange={(e) => setOffsiteTreatmentLocation(e.target.value)}
                  className={inputClass}
                  placeholder="Clinic / hospital name and location"
                />
              </div>
            ) : null}
            <div>
              <label className={labelClass} htmlFor="treatment-given">
                What treatment was given?
              </label>
              <textarea
                id="treatment-given"
                value={treatmentGiven}
                onChange={(e) => setTreatmentGiven(e.target.value)}
                className={inputClass}
                rows={2}
              />
            </div>
          </div>

          <div className="grid gap-4">
            <div>
              <label className={labelClass} htmlFor="what-occurred">
                What occurred? *
              </label>
              <textarea
                id="what-occurred"
                value={whatOccurred}
                onChange={(e) => setWhatOccurred(e.target.value)}
                className={inputClass}
                rows={3}
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="incident-location">
                Where did the incident occur? *
              </label>
              <textarea
                id="incident-location"
                value={incidentLocationDetails}
                onChange={(e) => setIncidentLocationDetails(e.target.value)}
                className={inputClass}
                rows={2}
                required
              />
            </div>
          </div>

          <WorkerSearchSelect
            id="incident-witnesses"
            mode="multiple"
            label="Names of any witnesses"
            workers={projectWorkers}
            selected={witnessIds}
            onChange={setWitnessIds}
            disabled={workersDisabled}
            placeholder={
              loadingWorkers
                ? "Loading project workers…"
                : projectId
                  ? "Search and tag witnesses…"
                  : "Select a project first…"
            }
            searchPlaceholder="Search project workers by name or email…"
            getWorkerLabel={workerOptionLabel}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <YesNoToggle
              id="corrective-action"
              label="Does immediate corrective action need to be taken to prevent danger to other workers/plant/environment? *"
              value={immediateCorrectiveActionRequired}
              onChange={setImmediateCorrectiveActionRequired}
              disabled={saving}
            />
            <YesNoToggle
              id="notifiable-whs"
              label="Is the incident notifiable under the health & safety legislation? (If unsure contact your PM) *"
              value={isNotifiableUnderWhs}
              onChange={setIsNotifiableUnderWhs}
              disabled={saving}
            />
          </div>

          <div className="rounded-xl border border-slate-200 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Root Cause Analysis</h3>
            <div>
              <label className={labelClass} htmlFor="caused-wrong">
                What caused it to go wrong?
              </label>
              <textarea
                id="caused-wrong"
                value={whatCausedToGoWrong}
                onChange={(e) => setWhatCausedToGoWrong(e.target.value)}
                className={inputClass}
                rows={2}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="could-prevent">
                What could have been done to prevent this incident?
              </label>
              <textarea
                id="could-prevent"
                value={whatCouldHavePrevented}
                onChange={(e) => setWhatCouldHavePrevented(e.target.value)}
                className={inputClass}
                rows={2}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="recommendations">
                Recommendations to prevent recurrence
              </label>
              <textarea
                id="recommendations"
                value={recommendationsToPrevent}
                onChange={(e) => setRecommendationsToPrevent(e.target.value)}
                className={inputClass}
                rows={2}
              />
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-900">Medical Certificates</h3>
            <input type="file" accept="image/*,.pdf" onChange={handleFilePicker} />
            <CameraCaptureInput
              label="Capture medical certificate photo"
              onCapture={(file) => void handleMedicalFile(file)}
            />
            {uploadingMedical ? (
              <p className="text-sm text-slate-500">Uploading…</p>
            ) : null}
            {medicalUrls.length > 0 ? (
              <ul className="space-y-1 text-sm text-slate-600">
                {medicalUrls.map((url) => (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-orange-600 underline"
                    >
                      View uploaded file
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div>
            <p className={labelClass}>Submitter signature *</p>
            <StableSignaturePad onChange={(value) => setSignature(value)} />
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Submit Incident Report
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
