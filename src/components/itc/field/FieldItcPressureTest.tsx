"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  getPressureTest,
  saveFieldPressureTest,
  type FieldItcRecord,
} from "@/lib/api/itc";
import {
  calculateAs2566PressureTest,
  diameterLooksLikeNominalSize,
  emptyPressureReadings,
  formatHhMm,
  headFromTestPressureKpa,
  lengthMetresToKilometres,
  PRESSURE_TEST_ACCENT,
  PRESSURE_TEST_HOURS,
  PRESSURE_TEST_V1_HOUR,
  PRESSURE_TEST_V2_HOUR,
  type PressureReadingInput,
} from "@/lib/itc-pressure-test";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface FieldItcPressureTestProps {
  itc: FieldItcRecord;
  projectId: string;
  workerId: string;
  workerName: string;
}

function formatNum(value: number | null | undefined, digits = 3): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

export default function FieldItcPressureTest({
  itc,
  projectId,
  workerId,
  workerName,
}: FieldItcPressureTestProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [startTime, setStartTime] = useState("");
  const [requiredPressureKpa, setRequiredPressureKpa] = useState("");
  const [lengthM, setLengthM] = useState(itc.length_m != null ? String(itc.length_m) : "");
  const [diameterM, setDiameterM] = useState("");
  const [headM, setHeadM] = useState("");
  const [v1, setV1] = useState("");
  const [v2, setV2] = useState("");
  const [readings, setReadings] = useState<PressureReadingInput[]>(emptyPressureReadings());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const row = await getPressureTest(itc.id);
      if (cancelled) return;
      if (row) {
        setStartTime(row.start_time ?? "");
        setRequiredPressureKpa(
          row.required_pressure_kpa != null ? String(row.required_pressure_kpa) : ""
        );
        setLengthM(
          row.length_km != null ? String(Number((row.length_km * 1000).toFixed(3))) : lengthM
        );
        setDiameterM(row.diameter_m != null ? String(row.diameter_m) : "");
        setHeadM(row.head_m != null ? String(row.head_m) : "");
        setV1(row.v1_litres != null ? String(row.v1_litres) : "");
        setV2(row.v2_litres != null ? String(row.v2_litres) : "");
        setReadings(row.readings.length ? row.readings : emptyPressureReadings());
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itc.id]);

  const lengthKm = lengthMetresToKilometres(lengthM ? Number(lengthM) : null);
  const diameter = diameterM ? Number(diameterM) : null;
  const requiredKpa = requiredPressureKpa ? Number(requiredPressureKpa) : null;
  const derivedHead = headM ? Number(headM) : headFromTestPressureKpa(requiredKpa);
  const v1Litres = readings.find((row) => row.hour_index === PRESSURE_TEST_V1_HOUR)?.water_added_l ??
    (v1 ? Number(v1) : null);
  const v2Litres = readings.find((row) => row.hour_index === PRESSURE_TEST_V2_HOUR)?.water_added_l ??
    (v2 ? Number(v2) : null);

  const calc = useMemo(
    () =>
      calculateAs2566PressureTest({
        v1Litres,
        v2Litres,
        lengthKm,
        diameterM: diameter,
        headM: derivedHead,
      }),
    [v1Litres, v2Litres, lengthKm, diameter, derivedHead]
  );

  const updateReading = (hourIndex: number, patch: Partial<PressureReadingInput>) => {
    setReadings((current) =>
      current.map((row) => (row.hour_index === hourIndex ? { ...row, ...patch } : row))
    );
  };

  const handleSave = async (submit: boolean) => {
    setSaving(true);
    setMessage(null);
    const result = await saveFieldPressureTest({
      itcId: itc.id,
      projectId,
      startTime: startTime || null,
      requiredPressureKpa: requiredKpa,
      v1Litres,
      v2Litres,
      v1Overridden: Boolean(v1),
      v2Overridden: Boolean(v2),
      lengthKm,
      diameterM: diameter,
      headM: derivedHead,
      readings,
      submit,
      submittedBy: submit ? workerId : null,
      submittedByName: submit ? workerName : null,
      stepIndex: 14,
    });
    setSaving(false);
    setMessage(result.error ?? (submit ? "Pressure test submitted." : "Pressure test saved."));
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
        Loading pressure test…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={`${cardClass} p-4`}>
        <h2 className="text-sm font-semibold text-slate-900">AS 2566.2 Pressure Test</h2>
        <p className="text-xs text-slate-500">
          Q = 0.14 × L(km) × D(m) × H(m). Allowable = 0.55 × V1 + Q. Pass when V2 ≤ allowable.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label>
            <span className={labelClass}>Start time</span>
            <input
              type="datetime-local"
              value={startTime.slice(0, 16)}
              onChange={(event) => setStartTime(event.target.value)}
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>Required pressure (kPa)</span>
            <input
              type="number"
              value={requiredPressureKpa}
              onChange={(event) => {
                setRequiredPressureKpa(event.target.value);
                const nextHead = headFromTestPressureKpa(Number(event.target.value));
                if (nextHead != null) setHeadM(String(nextHead));
              }}
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>Length L (m)</span>
            <input
              type="number"
              value={lengthM}
              onChange={(event) => setLengthM(event.target.value)}
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>Diameter D (m)</span>
            <input
              type="number"
              step="0.001"
              value={diameterM}
              onChange={(event) => setDiameterM(event.target.value)}
              className={inputClass}
            />
            {diameterLooksLikeNominalSize(diameter) ? (
              <span className="text-xs text-amber-700">Looks like DN mm — enter metres (e.g. 0.150).</span>
            ) : null}
          </label>
          <label>
            <span className={labelClass}>Head H (m)</span>
            <input
              type="number"
              step="0.001"
              value={headM}
              onChange={(event) => setHeadM(event.target.value)}
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>V1 override (L) hour {PRESSURE_TEST_V1_HOUR}</span>
            <input
              type="number"
              step="0.001"
              value={v1}
              onChange={(event) => setV1(event.target.value)}
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>V2 override (L) hour {PRESSURE_TEST_V2_HOUR}</span>
            <input
              type="number"
              step="0.001"
              value={v2}
              onChange={(event) => setV2(event.target.value)}
              className={inputClass}
            />
          </label>
        </div>
      </div>

      <div className={`${cardClass} overflow-hidden`}>
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">Hourly readings</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Hour</th>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Water added (L)</th>
                <th className="px-3 py-2">Pressure (kPa)</th>
              </tr>
            </thead>
            <tbody>
              {PRESSURE_TEST_HOURS.map((hour) => {
                const row = readings.find((item) => item.hour_index === hour) ?? {
                  hour_index: hour,
                  reading_time: "",
                  water_added_l: null,
                  pressure_kpa: null,
                };
                return (
                  <tr key={hour} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-semibold">{hour}</td>
                    <td className="px-3 py-2">
                      <input
                        value={row.reading_time}
                        placeholder={formatHhMm()}
                        onChange={(event) =>
                          updateReading(hour, { reading_time: event.target.value })
                        }
                        className={inputClass}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.001"
                        value={row.water_added_l ?? ""}
                        onChange={(event) =>
                          updateReading(hour, {
                            water_added_l: event.target.value
                              ? Number(event.target.value)
                              : null,
                          })
                        }
                        className={inputClass}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={row.pressure_kpa ?? ""}
                        onChange={(event) =>
                          updateReading(hour, {
                            pressure_kpa: event.target.value
                              ? Number(event.target.value)
                              : null,
                          })
                        }
                        className={inputClass}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`${cardClass} p-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1 text-sm">
            <p>
              Q = <strong>{formatNum(calc.qLitres)}</strong> L
            </p>
            <p>
              Allowable = <strong>{formatNum(calc.allowable)}</strong> L
            </p>
            <p>
              Verdict:{" "}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-semibold",
                  calc.verdict === "PASS"
                    ? "bg-emerald-100 text-emerald-800"
                    : calc.verdict === "FAIL"
                      ? "bg-red-100 text-red-800"
                      : "bg-amber-100 text-amber-800"
                )}
              >
                {calc.verdict}
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Save draft
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave(true)}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
              style={{ backgroundColor: PRESSURE_TEST_ACCENT }}
            >
              {saving ? "Saving…" : "Submit test"}
            </button>
          </div>
        </div>
        {message ? <p className="mt-2 text-sm text-slate-600">{message}</p> : null}
      </div>
    </div>
  );
}
