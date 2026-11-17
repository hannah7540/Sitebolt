"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import FormBrandingHeader from "@/components/ui/FormBrandingHeader";
import SignaturePad from "@/components/forms/SignaturePad";
import {
  packHighFidelityAnswers,
  type HighFidelityFormKey,
} from "@/lib/high-fidelity-forms";
import type { CustomFormAnswers, CustomFormTemplate } from "@/lib/custom-forms";
import { uploadSignatureDataUrl } from "@/lib/custom-form-upload";
import { cn } from "@/lib/utils";
import {
  inputClass,
  labelClass,
  modalBodyClass,
  modalCloseIconButtonClass,
  modalOverlayClass,
  modalShellClass,
  modalStickyFooterClass,
} from "@/lib/ui-classes";

const ISOLATION_ITEMS = [
  "Electrical isolation / lockout",
  "Mechanical isolation",
  "Pneumatic isolation",
  "Hydraulic isolation",
  "Process / pipeline blanking",
  "Ventilation established",
  "Rescue plan in place",
  "Standby person appointed",
] as const;

type AtmosphereRow = {
  id: string;
  time: string;
  oxygen: string;
  lel: string;
  h2s: string;
  co: string;
  other: string;
  result: "Pass" | "Fail" | "";
};

type RegisterRow = {
  id: string;
  name: string;
  role: string;
  signOn: string;
  signOff: string;
};

function newAtmosphereRow(): AtmosphereRow {
  return {
    id: `atm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    time: "",
    oxygen: "",
    lel: "",
    h2s: "",
    co: "",
    other: "",
    result: "",
  };
}

function newRegisterRow(): RegisterRow {
  return {
    id: `reg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    role: "",
    signOn: "",
    signOff: "",
  };
}

interface ConfinedSpaceFormProps {
  open: boolean;
  template: CustomFormTemplate;
  workerName: string;
  projectLabel?: string | null;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (payload: {
    answers: CustomFormAnswers;
    signatureUrl: string | null;
  }) => Promise<void> | void;
}

export default function ConfinedSpaceForm({
  open,
  template,
  workerName,
  projectLabel,
  saving = false,
  error = null,
  onClose,
  onSubmit,
}: ConfinedSpaceFormProps) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [permitDate, setPermitDate] = useState(today);
  const [spaceDescription, setSpaceDescription] = useState("");
  const [location, setLocation] = useState("");
  const [purpose, setPurpose] = useState("");
  const [isolations, setIsolations] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(ISOLATION_ITEMS.map((item) => [item, false]))
  );
  const [atmosphereRows, setAtmosphereRows] = useState<AtmosphereRow[]>([
    newAtmosphereRow(),
  ]);
  const [registerRows, setRegisterRows] = useState<RegisterRow[]>([
    { ...newRegisterRow(), name: workerName, role: "Entrant" },
  ]);
  const [notes, setNotes] = useState("");
  const [siteManagerSignature, setSiteManagerSignature] = useState<string | null>(
    null
  );
  const [competentPersonSignature, setCompetentPersonSignature] = useState<
    string | null
  >(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const updateAtmosphere = (id: string, patch: Partial<AtmosphereRow>) => {
    setAtmosphereRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
  };

  const updateRegister = (id: string, patch: Partial<RegisterRow>) => {
    setRegisterRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
  };

  const handleSubmit = async () => {
    setLocalError(null);
    if (!spaceDescription.trim()) {
      setLocalError("Describe the confined space before submitting.");
      return;
    }
    if (!siteManagerSignature?.trim()) {
      setLocalError("Site Manager signature is required.");
      return;
    }
    if (!competentPersonSignature?.trim()) {
      setLocalError("Competent Person signature is required.");
      return;
    }

    setSubmitting(true);
    try {
      const uploaded = await uploadSignatureDataUrl(
        siteManagerSignature,
        `custom-forms/confined-space/${Date.now()}`
      );
      if (uploaded.error && !uploaded.url) {
        throw new Error(uploaded.error);
      }

      const selectedIsolations = ISOLATION_ITEMS.filter((item) => isolations[item]);
      const signatures = {
        siteManager: siteManagerSignature,
        competentPerson: competentPersonSignature,
      };
      const payload = {
        formKey: "confined_space_entry" as HighFidelityFormKey,
        permitDate,
        spaceDescription: spaceDescription.trim(),
        location: location.trim(),
        purpose: purpose.trim(),
        isolations: selectedIsolations,
        atmosphericTesting: atmosphereRows,
        signOnRegister: registerRows,
        notes: notes.trim(),
        authorisedBy: workerName,
        signatures,
      };

      const answers = packHighFidelityAnswers({
        summaryLines: [
          { id: "permit_date", label: "Permit Date", value: permitDate },
          {
            id: "space_description",
            label: "Confined Space",
            value: spaceDescription,
          },
          { id: "location", label: "Location", value: location },
          { id: "purpose", label: "Purpose of Entry", value: purpose },
          {
            id: "isolations",
            label: "Isolations Complete",
            value: selectedIsolations.join(", "),
          },
          {
            id: "atmosphere_count",
            label: "Atmospheric Tests Logged",
            value: String(atmosphereRows.filter((row) => row.time || row.oxygen).length),
          },
          {
            id: "personnel_count",
            label: "Personnel on Register",
            value: String(registerRows.filter((row) => row.name.trim()).length),
          },
          { id: "authorised_by", label: "Authorised By", value: workerName },
          {
            id: "signoff_complete",
            label: "Authorisation Sign-off",
            value: "Site Manager + Competent Person signed",
          },
        ],
        payload,
      });

      answers.signature_site_manager = {
        label: "Site Manager Signature",
        type: "signature",
        value: { url: siteManagerSignature },
      };
      answers.signature_competent_person = {
        label: "Competent Person Signature",
        type: "signature",
        value: { url: competentPersonSignature },
      };

      await onSubmit({
        answers,
        signatureUrl: uploaded.url || siteManagerSignature,
      });
    } catch (cause) {
      setLocalError(
        cause instanceof Error
          ? cause.message
          : "Failed to submit Confined Space Entry Permit."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || typeof document === "undefined") return null;

  const busy = saving || submitting;

  return createPortal(
    <div className={modalOverlayClass}>
      <div className={cn(modalShellClass, "max-w-5xl")}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <FormBrandingHeader
            title={template.title}
            subtitle="Atmospheric testing, isolations, and entry register"
            meta={projectLabel ? `Project · ${projectLabel}` : undefined}
            className="border-0 pb-0"
          />
          <button type="button" onClick={onClose} className={modalCloseIconButtonClass}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={modalBodyClass}>
          <div className="space-y-6">
            <section className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="cs-date">
                  Permit date
                </label>
                <input
                  id="cs-date"
                  type="date"
                  className={cn(inputClass, "mt-1")}
                  value={permitDate}
                  onChange={(event) => setPermitDate(event.target.value)}
                  disabled={busy}
                />
              </div>
              <div>
                <label className={labelClass}>Authorised by</label>
                <p className="mt-2 text-sm font-semibold text-slate-900">{workerName}</p>
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="cs-space">
                  Confined space description *
                </label>
                <input
                  id="cs-space"
                  className={cn(inputClass, "mt-1")}
                  value={spaceDescription}
                  onChange={(event) => setSpaceDescription(event.target.value)}
                  placeholder="e.g. Stormwater pit SP-12"
                  disabled={busy}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="cs-location">
                  Location
                </label>
                <input
                  id="cs-location"
                  className={cn(inputClass, "mt-1")}
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  disabled={busy}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="cs-purpose">
                  Purpose of entry
                </label>
                <input
                  id="cs-purpose"
                  className={cn(inputClass, "mt-1")}
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value)}
                  disabled={busy}
                />
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                Isolations & Prerequisites
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {ISOLATION_ITEMS.map((item) => (
                  <label
                    key={item}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(isolations[item])}
                      onChange={(event) =>
                        setIsolations((current) => ({
                          ...current,
                          [item]: event.target.checked,
                        }))
                      }
                      disabled={busy}
                    />
                    {item}
                  </label>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                  Atmospheric Testing
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    setAtmosphereRows((rows) => [...rows, newAtmosphereRow()])
                  }
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-orange-700 hover:bg-orange-100 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add reading
                </button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-2 py-2 font-semibold">Time</th>
                      <th className="px-2 py-2 font-semibold">O₂ %</th>
                      <th className="px-2 py-2 font-semibold">LEL %</th>
                      <th className="px-2 py-2 font-semibold">H₂S</th>
                      <th className="px-2 py-2 font-semibold">CO</th>
                      <th className="px-2 py-2 font-semibold">Other</th>
                      <th className="px-2 py-2 font-semibold">Result</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {atmosphereRows.map((row) => (
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className="px-2 py-2">
                          <input
                            type="time"
                            className={inputClass}
                            value={row.time}
                            onChange={(event) =>
                              updateAtmosphere(row.id, { time: event.target.value })
                            }
                            disabled={busy}
                          />
                        </td>
                        {(["oxygen", "lel", "h2s", "co", "other"] as const).map(
                          (field) => (
                            <td key={field} className="px-2 py-2">
                              <input
                                className={inputClass}
                                value={row[field]}
                                onChange={(event) =>
                                  updateAtmosphere(row.id, {
                                    [field]: event.target.value,
                                  })
                                }
                                disabled={busy}
                              />
                            </td>
                          )
                        )}
                        <td className="px-2 py-2">
                          <select
                            className={inputClass}
                            value={row.result}
                            onChange={(event) =>
                              updateAtmosphere(row.id, {
                                result: event.target.value as AtmosphereRow["result"],
                              })
                            }
                            disabled={busy}
                          >
                            <option value="">—</option>
                            <option value="Pass">Pass</option>
                            <option value="Fail">Fail</option>
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            disabled={busy || atmosphereRows.length <= 1}
                            onClick={() =>
                              setAtmosphereRows((rows) =>
                                rows.length <= 1
                                  ? rows
                                  : rows.filter((item) => item.id !== row.id)
                              )
                            }
                            className="text-red-600 disabled:opacity-40"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                  Sign On / Off Register
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    setRegisterRows((rows) => [...rows, newRegisterRow()])
                  }
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-orange-700 hover:bg-orange-100 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add person
                </button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-2 py-2 font-semibold">Name</th>
                      <th className="px-2 py-2 font-semibold">Role</th>
                      <th className="px-2 py-2 font-semibold">Sign on</th>
                      <th className="px-2 py-2 font-semibold">Sign off</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {registerRows.map((row) => (
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className="px-2 py-2">
                          <input
                            className={inputClass}
                            value={row.name}
                            onChange={(event) =>
                              updateRegister(row.id, { name: event.target.value })
                            }
                            disabled={busy}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className={inputClass}
                            value={row.role}
                            onChange={(event) =>
                              updateRegister(row.id, { role: event.target.value })
                            }
                            placeholder="Entrant / Standby / Supervisor"
                            disabled={busy}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="time"
                            className={inputClass}
                            value={row.signOn}
                            onChange={(event) =>
                              updateRegister(row.id, { signOn: event.target.value })
                            }
                            disabled={busy}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="time"
                            className={inputClass}
                            value={row.signOff}
                            onChange={(event) =>
                              updateRegister(row.id, { signOff: event.target.value })
                            }
                            disabled={busy}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            disabled={busy || registerRows.length <= 1}
                            onClick={() =>
                              setRegisterRows((rows) =>
                                rows.length <= 1
                                  ? rows
                                  : rows.filter((item) => item.id !== row.id)
                              )
                            }
                            className="text-red-600 disabled:opacity-40"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <label className={labelClass} htmlFor="cs-notes">
                Notes / special conditions
              </label>
              <textarea
                id="cs-notes"
                className={cn(inputClass, "mt-1 min-h-[80px] resize-y")}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                disabled={busy}
              />
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                Authorisation Signatures
              </h3>
              <SignaturePad
                label="Site Manager"
                required
                disabled={busy}
                value={siteManagerSignature}
                onChange={setSiteManagerSignature}
              />
              <SignaturePad
                label="Competent Person"
                required
                disabled={busy}
                value={competentPersonSignature}
                onChange={setCompetentPersonSignature}
              />
            </section>

            {localError || error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {localError || error}
              </p>
            ) : null}
          </div>
        </div>

        <div className={modalStickyFooterClass}>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Submit Entry Permit
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
