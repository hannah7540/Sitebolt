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
  const [injuredWorkerId, setInjuredWorkerId] = useState("");
  const [injuryDetails, setInjuryDetails] = useState("");
  const [treatmentDetails, setTreatmentDetails] =
    useState<IncidentTreatmentDetails>("None");
  const [treatingPersonId, setTreatingPersonId] = useState("");
  const [offsiteTreatmentLocation, setOffsiteTreatmentLocation] = useState("");
  const [whatOccurred, setWhatOccurred] = useState("");
  const [incidentLocationDetails, setIncidentLocationDetails] = useState("");
  const [treatmentGiven, setTreatmentGiven] = useState("");
  const [witnessIds, setWitnessIds] = useState<string[]>([]);
  const [immediateCorrectiveActionRequired, setImmediateCorrectiveActionRequired] =
    useState(false);
  const [isNotifiableUnderWhs, setIsNotifiableUnderWhs] = useState(false);
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
        setInjuredWorkerId("");
        setTreatingPersonId("");
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

  const toggleWitness = (id: string) => {
    setWitnessIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const handleMedicalFile = async (file: File | null) => {
    if (!file) return;
    setUploadingMedical(true);
    try {
      const url = await uploadIncidentMedicalCertificate(
        file,
        `${worker.id}-${Date.now()}`
      );
      if (!url) {
        showError("Failed to upload medical certificate.");
        return;
      }
      setMedicalUrls((current) => [...current, url]);
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
    if (!signature.trim()) {
      setError("Please sign the incident report.");
      return;
    }

    setSaving(true);
    try {
      const signatureUrl =
        (await uploadIncidentSignature(signature, `${worker.id}-${Date.now()}`)) ||
        signature;

      const injured = projectWorkers.find((row) => row.id === injuredWorkerId);
      const treating = projectWorkers.find((row) => row.id === treatingPersonId);
      const witnesses = projectWorkers.filter((row) => witnessIds.includes(row.id));

      const response = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submittedByName: getWorkerDisplayName(worker, "Worker"),
          incidentDateTime: new Date(incidentDateTime).toISOString(),
          projectId,
          projectName: selectedProject?.name ?? "Project",
          injuredWorkerId: injuredWorkerId || null,
          injuredWorkerName: injured ? workerOptionLabel(injured) : null,
          injuryDetails,
          treatmentDetails,
          treatingPersonId: isOnsiteTreatment ? treatingPersonId || null : null,
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
          submitterSignatureUrl: signatureUrl,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        report?: { reference_number?: string };
      } | null;

      if (!response.ok) {
        const message = payload?.error ?? "Failed to submit incident report.";
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
            <div>
              <label className={labelClass} htmlFor="injured-worker">
                Details of injured worker
              </label>
              <select
                id="injured-worker"
                value={injuredWorkerId}
                onChange={(e) => setInjuredWorkerId(e.target.value)}
                className={inputClass}
                disabled={!projectId || loadingWorkers}
              >
                <option value="">No injury / not applicable</option>
                {projectWorkers.map((row) => (
                  <option key={row.id} value={row.id}>
                    {workerOptionLabel(row)}
                  </option>
                ))}
              </select>
            </div>
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
              <div>
                <label className={labelClass} htmlFor="treating-person">
                  Treating person (onsite) *
                </label>
                <select
                  id="treating-person"
                  value={treatingPersonId}
                  onChange={(e) => setTreatingPersonId(e.target.value)}
                  className={inputClass}
                  disabled={loadingWorkers}
                >
                  <option value="">Select treating person…</option>
                  {projectWorkers.map((row) => (
                    <option key={row.id} value={row.id}>
                      {workerOptionLabel(row)}
                    </option>
                  ))}
                </select>
              </div>
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

          <div>
            <p className={labelClass}>Names of any witnesses</p>
            {loadingWorkers ? (
              <p className="text-sm text-slate-500">Loading project workers…</p>
            ) : projectWorkers.length === 0 ? (
              <p className="text-sm text-slate-500">
                Select a project with assigned workers to choose witnesses.
              </p>
            ) : (
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {projectWorkers.map((row) => (
                  <label
                    key={row.id}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={witnessIds.includes(row.id)}
                      onChange={() => toggleWitness(row.id)}
                    />
                    {workerOptionLabel(row)}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={immediateCorrectiveActionRequired}
                onChange={(e) => setImmediateCorrectiveActionRequired(e.target.checked)}
              />
              <span>
                Immediate corrective action needed to prevent danger to other workers,
                plant, or the environment?
              </span>
            </label>
            <label className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={isNotifiableUnderWhs}
                onChange={(e) => setIsNotifiableUnderWhs(e.target.checked)}
              />
              <span>
                Is the incident notifiable under health &amp; safety legislation? (If
                unsure contact your PM)
              </span>
            </label>
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
                    <a href={url} target="_blank" rel="noreferrer" className="text-orange-600 underline">
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
