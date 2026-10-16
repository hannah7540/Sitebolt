"use client";

import { useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { uploadExternalSwms } from "@/app/actions/swms-external";
import { filterActiveProjects, type DbProject } from "@/lib/project-resolver";
import { isValidSwmsId } from "@/lib/supabase";
import { inputClass, labelClass, modalClass, modalOverlayClass } from "@/lib/ui-classes";

interface UploadExternalSwmsModalProps {
  projects?: DbProject[];
  lockedProjectId?: string | null;
  lockedProjectName?: string | null;
  defaultScope?: "company" | "project";
  onClose: () => void;
  onSaved: () => void;
}

export default function UploadExternalSwmsModal({
  projects = [],
  lockedProjectId,
  lockedProjectName,
  defaultScope = "company",
  onClose,
  onSaved,
}: UploadExternalSwmsModalProps) {
  const activeProjects = useMemo(() => filterActiveProjects(projects), [projects]);
  const scopeLocked = Boolean(lockedProjectId && isValidSwmsId(lockedProjectId));
  const [title, setTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [scope, setScope] = useState<"company" | "project">(
    scopeLocked ? "project" : defaultScope
  );
  const [projectId, setProjectId] = useState(lockedProjectId ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedTitle, setSavedTitle] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("SWMS title is required.");
      return;
    }
    if (!companyName.trim()) {
      setError("Builder / company name is required.");
      return;
    }
    if (!file) {
      setError("Upload a SWMS PDF.");
      return;
    }
    if (scope === "project" && !isValidSwmsId(projectId)) {
      setError("Select a valid project.");
      return;
    }

    const formData = new FormData();
    formData.set("title", title.trim());
    formData.set("companyName", companyName.trim());
    formData.set("scope", scope);
    if (scope === "project") formData.set("projectId", projectId.trim());
    formData.set("file", file);

    setSaving(true);
    const result = await uploadExternalSwms(formData);
    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setSavedTitle(title.trim());
    onSaved();
  };

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={`${modalClass} max-w-lg`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Upload External SWMS</h2>
            <p className="text-sm text-slate-500">
              Add a third-party SWMS PDF so it can be sent out for signatures.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        {savedTitle ? (
          <div className="space-y-4">
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              “{savedTitle}” uploaded. You can now assign it to workers or send it to a guest.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
            <label className="block space-y-1">
              <span className={labelClass}>SWMS Title *</span>
              <input
                className={inputClass}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. High Risk Construction Work"
                required
              />
            </label>

            <label className="block space-y-1">
              <span className={labelClass}>Builder / Company Name *</span>
              <input
                className={inputClass}
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="e.g. Acme Builders"
                required
              />
            </label>

            <fieldset className="space-y-2">
              <legend className={labelClass}>Scope *</legend>
              {scopeLocked ? (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  Locked to this project
                  {lockedProjectName ? `: ${lockedProjectName}` : ""}.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="scope"
                      checked={scope === "company"}
                      onChange={() => setScope("company")}
                    />
                    Company
                  </label>
                  <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="scope"
                      checked={scope === "project"}
                      onChange={() => setScope("project")}
                    />
                    Project
                  </label>
                </div>
              )}
            </fieldset>

            {scope === "project" && !scopeLocked ? (
              <label className="block space-y-1">
                <span className={labelClass}>Project *</span>
                <select
                  className={inputClass}
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                  required
                >
                  {activeProjects.length === 0 ? (
                    <option value="">No active projects</option>
                  ) : (
                    <>
                      <option value="">Select a project…</option>
                      {activeProjects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </label>
            ) : null}

            <label className="block space-y-1">
              <span className={labelClass}>SWMS PDF *</span>
              <input
                type="file"
                accept="application/pdf"
                className={inputClass}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                required
              />
            </label>

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Upload SWMS
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
