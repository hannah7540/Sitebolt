"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import SignatureCanvas from "@/components/prestart/SignatureCanvas";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import {
  calculateAs2566PressureTest,
  diameterLooksLikeNominalSize,
  emptyPressureReadings,
  formatHhMm,
  headFromTestPressureKpa,
  lengthMetresToKilometres,
  nextDuePressureReading,
  PRESSURE_TEST_ACCENT,
  PRESSURE_TEST_HOURS,
  PRESSURE_TEST_V1_HOUR,
  PRESSURE_TEST_V2_HOUR,
  waterAddedAtHour,
  type PressureReadingInput,
  type PressureTestVerdict,
} from "@/lib/itc-pressure-test";
import {
  fetchLatestPressureTest,
  savePressureTest,
  type PressureTestRow,
} from "@/lib/itc-pressure-test-service";
import {
  inputClass,
  labelClass,
  modalBodyClass,
  modalCloseIconButtonClass,
  modalOverlayClass,
  modalShellClass,
  modalStickyFooterClass,
} from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

export interface PressureTestItcContext {
  site: string;
  project: string;
  subcontractor: string;
  lineFrom: string;
  lineTo: string;
  sizeMaterial: string;
  lengthM: number | null;
}

interface PressureTestModalProps {
  itcId: string;
  projectId: string;
  context: PressureTestItcContext;
  workerId: string;
  workerName: string;
  stepIndex: number;
  isAdmin?: boolean;
  readOnly?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function verdictBadgeClass(verdict: PressureTestVerdict): string {
  if (verdict === "PASS") return "bg-emerald-100 text-emerald-800 ring-emerald-200";
  if (verdict === "FAIL") return "bg-red-100 text-red-800 ring-red-200";
  return "bg-amber-100 text-amber-800 ring-amber-200";
}

function formatNum(value: number | null | undefined, digits = 3): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function parseOptionalNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ContextCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-900">{value || "—"}</p>
    </div>
  );
}

export default function PressureTestModal({
  itcId,
  projectId,
  context,
  workerId,
  workerName,
  stepIndex,
  isAdmin = false,
  readOnly = false,
  onClose,
  onSaved,
}: PressureTestModalProps) {
  const { toast, showError, showSuccess, dismissToast } = useFormToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [test, setTest] = useState<PressureTestRow | null>(null);
  const [startLocal, setStartLocal] = useState("");
  const [requiredPressure, setRequiredPressure] = useState("");
  const [readings, setReadings] = useState<PressureReadingInput[]>(emptyPressureReadings);
  const [v1, setV1] = useState("");
  const [v2, setV2] = useState("");
  const [v1Overridden, setV1Overridden] = useState(false);
  const [v2Overridden, setV2Overridden] = useState(false);
  const [diameterM, setDiameterM] = useState("");
  const [headM, setHeadM] = useState("");
  const [aplusSig, setAplusSig] = useState<string | null>(null);
  const [pcSig, setPcSig] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const submitted = Boolean(test?.submitted_at);
  const frozen = submitted;
  const canEdit = !readOnly && !submitted;

  const applyTest = useCallback((row: PressureTestRow | null) => {
    setTest(row);
    setStartLocal(toDatetimeLocalValue(row?.start_time ?? null));
    setRequiredPressure(
      row?.required_pressure_kpa != null ? String(row.required_pressure_kpa) : ""
    );
    setReadings(row?.readings?.length ? row.readings : emptyPressureReadings());
    setV1(row?.v1_litres != null ? String(row.v1_litres) : "");
    setV2(row?.v2_litres != null ? String(row.v2_litres) : "");
    setV1Overridden(row?.v1_overridden === true);
    setV2Overridden(row?.v2_overridden === true);
    setDiameterM(row?.diameter_m != null ? String(row.diameter_m) : "");
    setHeadM(row?.head_m != null ? String(row.head_m) : "");
    setAplusSig(null);
    setPcSig(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchLatestPressureTest(itcId).then((row) => {
      if (cancelled) return;
      applyTest(row);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [applyTest, itcId]);

  useEffect(() => {
    if (!canEdit) return;
    const timer = window.setInterval(() => setNowTick(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, [canEdit]);

  useEffect(() => {
    if (!canEdit || v1Overridden) return;
    const hour3 = waterAddedAtHour(readings, PRESSURE_TEST_V1_HOUR);
    setV1(hour3 != null ? String(hour3) : "");
  }, [canEdit, readings, v1Overridden]);

  useEffect(() => {
    if (!canEdit || v2Overridden) return;
    const hour5 = waterAddedAtHour(readings, PRESSURE_TEST_V2_HOUR);
    setV2(hour5 != null ? String(hour5) : "");
  }, [canEdit, readings, v2Overridden]);

  const lengthKm = useMemo(
    () => lengthMetresToKilometres(context.lengthM),
    [context.lengthM]
  );

  const liveCalc = useMemo(
    () =>
      calculateAs2566PressureTest({
        v1Litres: parseOptionalNumber(v1),
        v2Litres: parseOptionalNumber(v2),
        lengthKm,
        diameterM: parseOptionalNumber(diameterM),
        headM: parseOptionalNumber(headM),
      }),
    [diameterM, headM, lengthKm, v1, v2]
  );

  const displayCalc = frozen && test
    ? {
        qLitres: test.q_litres,
        allowable: test.allowable,
        passed: test.passed,
        verdict: (test.passed === true ? "PASS" : test.passed === false ? "FAIL" : "WAIT") as PressureTestVerdict,
        complete: test.passed != null,
      }
    : liveCalc;

  const due = useMemo(
    () =>
      nextDuePressureReading({
        startTimeIso: fromDatetimeLocalValue(startLocal),
        readings,
        now: new Date(nowTick),
      }),
    [nowTick, readings, startLocal]
  );

  const updateReading = (
    hourIndex: number,
    patch: Partial<PressureReadingInput>
  ) => {
    setReadings((current) =>
      current.map((row) =>
        row.hour_index === hourIndex ? { ...row, ...patch } : row
      )
    );
  };

  const handleNow = (hourIndex: number) => {
    const stamp = formatHhMm();
    updateReading(hourIndex, { reading_time: stamp });
    if (hourIndex === 0 && !startLocal) {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      setStartLocal(
        `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${stamp}`
      );
    }
  };

  const persist = async (submit: boolean) => {
    setSaving(true);
    const result = await savePressureTest({
      testId: test?.id ?? null,
      itcId,
      projectId,
      startTime: fromDatetimeLocalValue(startLocal),
      requiredPressureKpa: parseOptionalNumber(requiredPressure),
      v1Litres: parseOptionalNumber(v1),
      v2Litres: parseOptionalNumber(v2),
      v1Overridden,
      v2Overridden,
      lengthKm,
      diameterM: parseOptionalNumber(diameterM),
      headM: parseOptionalNumber(headM),
      readings,
      aplusSigDataUrl: aplusSig,
      pcSigDataUrl: pcSig,
      existingAplusSig: test?.aplus_sig ?? null,
      existingPcSig: test?.pc_sig ?? null,
      submit,
      submittedBy: workerId,
      submittedByName: workerName,
      stepIndex,
      autoVerify: isAdmin,
    });
    setSaving(false);

    if (result.error || !result.test) {
      showError(result.error ?? "Failed to save pressure test.");
      return;
    }

    applyTest(result.test);
    showSuccess(
      submit
        ? result.test.passed
          ? "Pressure test submitted — PASS"
          : "Pressure test submitted — FAIL. An NCR was raised."
        : "Pressure test draft saved."
    );
    if (submit) onSaved();
  };

  const handleRetest = () => {
    applyTest(null);
    setTest(null);
  };

  return (
    <div className={cn(modalOverlayClass, "z-[80]")} onClick={onClose}>
      <div
        className={cn(modalShellClass, "max-w-5xl")}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="flex items-start justify-between gap-3 border-b px-4 py-3 sm:px-6"
          style={{ borderColor: PRESSURE_TEST_ACCENT }}
        >
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: PRESSURE_TEST_ACCENT }}
            >
              AS 2566.2 Section M5
            </p>
            <h3 className="text-lg font-bold text-slate-900">
              {frozen ? "Pressure Test Certificate" : "Hydraulic Pressure Test"}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset",
                verdictBadgeClass(displayCalc.verdict)
              )}
            >
              {displayCalc.verdict}
            </span>
            <button type="button" onClick={onClose} className={modalCloseIconButtonClass} aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className={modalBodyClass}>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading pressure test…
            </div>
          ) : (
            <div className="space-y-5">
              <div
                className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-3"
                style={{ borderColor: PRESSURE_TEST_ACCENT }}
              >
                <ContextCell label="Site" value={context.site} />
                <ContextCell label="Project" value={context.project} />
                <ContextCell label="Subcontractor" value={context.subcontractor} />
                <ContextCell
                  label="Line from / to"
                  value={`${context.lineFrom || "—"} → ${context.lineTo || "—"}`}
                />
                <ContextCell label="Size / Material" value={context.sizeMaterial} />
                <ContextCell
                  label="Length (m)"
                  value={context.lengthM != null ? String(context.lengthM) : "—"}
                />
              </div>
              {context.lengthM == null ? (
                <p className="text-sm font-semibold text-amber-700">
                  ITC pipe length is missing, so L (km) cannot be calculated. Add length on the
                  hydraulic ITC before submitting.
                </p>
              ) : null}

              {canEdit && due ? (
                <div
                  className={cn(
                    "rounded-lg border px-4 py-3 text-sm font-semibold",
                    due.isNow || due.isAlert
                      ? "border-red-200 bg-red-50 text-red-800"
                      : "border-orange-200 bg-orange-50 text-orange-900"
                  )}
                >
                  {due.label}
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className={labelClass}>Test start time</span>
                  <input
                    type="datetime-local"
                    className={inputClass}
                    value={startLocal}
                    disabled={!canEdit}
                    onChange={(event) => setStartLocal(event.target.value)}
                  />
                </label>
                <label className="block space-y-1">
                  <span className={labelClass}>Required test pressure (kPa)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    className={inputClass}
                    value={requiredPressure}
                    disabled={!canEdit}
                    onChange={(event) => setRequiredPressure(event.target.value)}
                  />
                </label>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Hour</th>
                      <th className="px-3 py-2">Reading time</th>
                      <th className="px-3 py-2">Water added (L)</th>
                      <th className="px-3 py-2">Pressure (kPa)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PRESSURE_TEST_HOURS.map((hour) => {
                      const row =
                        readings.find((item) => item.hour_index === hour) ?? {
                          hour_index: hour,
                          reading_time: "",
                          water_added_l: null,
                          pressure_kpa: null,
                        };
                      const isV1 = hour === PRESSURE_TEST_V1_HOUR;
                      const isV2 = hour === PRESSURE_TEST_V2_HOUR;
                      return (
                        <tr
                          key={hour}
                          className={cn(
                            "border-t border-slate-100",
                            isV1 && "bg-orange-50",
                            isV2 && "bg-amber-50"
                          )}
                        >
                          <td className="px-3 py-2 font-semibold text-slate-800">
                            {hour}
                            {isV1 ? (
                              <span className="ml-2 text-[11px] font-bold" style={{ color: PRESSURE_TEST_ACCENT }}>
                                V1
                              </span>
                            ) : null}
                            {isV2 ? (
                              <span className="ml-2 text-[11px] font-bold text-amber-700">V2</span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="time"
                                className={cn(inputClass, "w-32")}
                                value={row.reading_time}
                                disabled={!canEdit}
                                onChange={(event) =>
                                  updateReading(hour, { reading_time: event.target.value.slice(0, 5) })
                                }
                              />
                              {canEdit ? (
                                <button
                                  type="button"
                                  onClick={() => handleNow(hour)}
                                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                  Now
                                </button>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              className={inputClass}
                              value={row.water_added_l ?? ""}
                              disabled={!canEdit}
                              onChange={(event) =>
                                updateReading(hour, {
                                  water_added_l: parseOptionalNumber(event.target.value),
                                })
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              className={inputClass}
                              value={row.pressure_kpa ?? ""}
                              disabled={!canEdit}
                              onChange={(event) =>
                                updateReading(hour, {
                                  pressure_kpa: parseOptionalNumber(event.target.value),
                                })
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="block space-y-1">
                  <span className={labelClass}>V1 (Hour 3 water added, L)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    className={inputClass}
                    value={v1}
                    disabled={!canEdit}
                    onChange={(event) => {
                      setV1(event.target.value);
                      setV1Overridden(true);
                    }}
                  />
                </label>
                <label className="block space-y-1">
                  <span className={labelClass}>V2 (Hour 5 water added, L)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    className={inputClass}
                    value={v2}
                    disabled={!canEdit}
                    onChange={(event) => {
                      setV2(event.target.value);
                      setV2Overridden(true);
                    }}
                  />
                </label>
                <label className="block space-y-1">
                  <span className={labelClass}>L — length (km)</span>
                  <input className={inputClass} value={formatNum(lengthKm, 6)} disabled />
                  <p className="text-xs text-slate-500">Auto from ITC length ÷ 1000.</p>
                </label>
                <label className="block space-y-1">
                  <span className={labelClass}>D — inside diameter (m)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.001}
                    className={inputClass}
                    value={diameterM}
                    disabled={!canEdit}
                    onChange={(event) => setDiameterM(event.target.value)}
                    placeholder="e.g. 0.150 for DN150"
                  />
                  {diameterLooksLikeNominalSize(parseOptionalNumber(diameterM)) ? (
                    <p className="text-xs font-semibold text-amber-700">
                      Enter inside diameter in metres (e.g. 0.150 for DN150), not millimetres.
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500">Use metres, e.g. 0.150 for DN150.</p>
                  )}
                </label>
                <label className="block space-y-1">
                  <span className={labelClass}>H — head of pressure (m)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    className={inputClass}
                    value={headM}
                    disabled={!canEdit}
                    onChange={(event) => setHeadM(event.target.value)}
                  />
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => {
                        const head = headFromTestPressureKpa(parseOptionalNumber(requiredPressure));
                        if (head == null) {
                          showError("Enter required test pressure first.");
                          return;
                        }
                        setHeadM(String(head));
                      }}
                      className="text-xs font-semibold"
                      style={{ color: PRESSURE_TEST_ACCENT }}
                    >
                      Use from test pressure (H = kPa / 9.80665)
                    </button>
                  ) : null}
                </label>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <p className="text-xs font-semibold uppercase text-slate-500">Q = 0.14 × L × D × H</p>
                  <p className="mt-1 font-bold tabular-nums text-slate-900">
                    {formatNum(displayCalc.qLitres)} L
                  </p>
                  <p className="mt-2 text-xs font-semibold uppercase text-slate-500">
                    Allowable = 0.55 × V1 + Q
                  </p>
                  <p className="mt-1 font-bold tabular-nums text-slate-900">
                    {formatNum(displayCalc.allowable)} L
                  </p>
                  <p className="mt-2 text-xs text-slate-500">Pass when V2 ≤ allowable volume.</p>
                </div>
              </div>

              {frozen ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">
                      Subcontractor representative (A Plus Plumbing)
                    </p>
                    {test?.aplus_sig ? (
                      <img
                        src={test.aplus_sig}
                        alt="Subcontractor signature"
                        className="mt-2 h-24 w-full rounded border border-slate-200 bg-white object-contain"
                      />
                    ) : (
                      <p className="mt-2 text-sm text-slate-500">No signature stored.</p>
                    )}
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">
                      Principal contractor representative
                    </p>
                    {test?.pc_sig ? (
                      <img
                        src={test.pc_sig}
                        alt="Principal contractor signature"
                        className="mt-2 h-24 w-full rounded border border-slate-200 bg-white object-contain"
                      />
                    ) : (
                      <p className="mt-2 text-sm text-slate-500">No signature stored.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-slate-500">
                      Subcontractor representative (A Plus Plumbing)
                    </p>
                    <SignatureCanvas onChange={setAplusSig} />
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-slate-500">
                      Principal contractor representative
                    </p>
                    <SignatureCanvas onChange={setPcSig} />
                  </div>
                </div>
              )}

              {frozen && test?.submitted_at ? (
                <p className="text-xs text-slate-500">
                  Signed off {new Date(test.submitted_at).toLocaleString()}. Calculated values are
                  frozen at submission and are not re-run.
                </p>
              ) : null}
            </div>
          )}
        </div>

        <div className={modalStickyFooterClass}>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            >
              Close
            </button>
            {frozen && test?.passed === false && !readOnly ? (
              <button
                type="button"
                onClick={handleRetest}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Start retest
              </button>
            ) : null}
            {canEdit ? (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void persist(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save draft"}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void persist(true)}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: PRESSURE_TEST_ACCENT }}
                >
                  {saving ? "Submitting…" : "Submit test"}
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {toast ? (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      ) : null}
    </div>
  );
}
