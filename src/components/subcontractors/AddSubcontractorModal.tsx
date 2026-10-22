"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { inviteSubcontractor } from "@/lib/subcontractors";
import { fetchProjects, type DbProject } from "@/lib/project-resolver";
import {
  inputClass,
  labelClass,
  modalBodyClass,
  modalOverlayClass,
  modalShellClass,
  modalStickyFooterClass,
} from "@/lib/ui-classes";

const INVITE_STATES = ["WA", "NZ", "ACT", "NSW"] as const;

export interface AddSubcontractorSavedDetails {
  email: string;
  inviteSent: boolean;
  inviteError: string | null;
}

interface AddSubcontractorModalProps {
  onClose: () => void;
  onSaved: (subcontractorId: string, details: AddSubcontractorSavedDetails) => void;
  onError?: (message: string) => void;
}

export default function AddSubcontractorModal({
  onClose,
  onSaved,
  onError,
}: AddSubcontractorModalProps) {
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState("");
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [projects, setProjects] = useState<DbProject[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    void fetchProjects()
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  const toggleProject = (projectId: string) => {
    setProjectIds((current) =>
      current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId]
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const result = await inviteSubcontractor({
      companyName,
      contactName,
      email,
      state,
      projectIds,
    });
    setSaving(false);
    if (result.error || !result.id) {
      const message = result.error ?? "Failed to invite subcontractor.";
      setError(message);
      onError?.(message);
      return;
    }
    onSaved(result.id, {
      email,
      inviteSent: !result.inviteError,
      inviteError: result.inviteError,
    });
    onClose();
  };

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={`${modalShellClass} max-w-lg`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Add New Subcontractor</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Invite a subcontractor company and assign them to projects.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className={`${modalBodyClass} space-y-4`}>
            <label className="block space-y-1">
              <span className={labelClass}>Company Name *</span>
              <input
                className={inputClass}
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                required
              />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Contact Person Name *</span>
              <input
                className={inputClass}
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                required
              />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Email Address *</span>
              <input
                type="email"
                className={inputClass}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>State *</span>
              <select
                className={inputClass}
                value={state}
                onChange={(event) => setState(event.target.value)}
                required
              >
                <option value="">Select state</option>
                {INVITE_STATES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="space-y-2">
              <legend className={labelClass}>Assigned Projects *</legend>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3">
                {projects.length === 0 ? (
                  <p className="text-sm text-slate-500">No projects available.</p>
                ) : (
                  <div className="space-y-2">
                    {projects.map((project) => (
                      <label
                        key={project.id}
                        className="flex items-center gap-2 text-sm text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={projectIds.includes(project.id)}
                          onChange={() => toggleProject(project.id)}
                          className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                        />
                        {project.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </fieldset>

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            ) : null}
          </div>

          <div className={`${modalStickyFooterClass} flex gap-2 pb-4`}>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Send Invite
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
