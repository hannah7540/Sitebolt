"use client";

import { useMemo } from "react";
import type { AdminPressureTestData } from "@/components/itc/admin/itp-itc-admin-types";
import {
  calculateAs2566PressureTest,
  formatHhMm,
  headFromTestPressureKpa,
  lengthMetresToKilometres,
  PRESSURE_TEST_HOURS,
  PRESSURE_TEST_V1_HOUR,
  PRESSURE_TEST_V2_HOUR,
} from "@/lib/itc-pressure-test";
import { cardClass, inputClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface AdminItcPressureTestSectionProps {
  serviceLabel: string;
  value: AdminPressureTestData;
  onChange: (next: AdminPressureTestData) => void;
}

function formatNum(value: number | null | undefined, digits = 3): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

export default function AdminItcPressureTestSection({
  serviceLabel,
  value,
  onChange,
}: AdminItcPressureTestSectionProps) {
  const readings = value.readings;
  const v1 =
    readings.find((row) => row.hour_index === PRESSURE_TEST_V1_HOUR)?.water_added_l ?? null;
  const v2 =
    readings.find((row) => row.hour_index === PRESSURE_TEST_V2_HOUR)?.water_added_l ?? null;
  const lengthKm = lengthMetresToKilometres(value.length_m);
  const derivedHead =
    value.head_m ?? headFromTestPressureKpa(value.required_pressure_kpa);
  const calc = useMemo(
    () =>
      calculateAs2566PressureTest({
        v1Litres: v1,
        v2Litres: v2,
        lengthKm,
        diameterM: value.diameter_m,
        headM: derivedHead,
      }),
    [v1, v2, lengthKm, value.diameter_m, derivedHead]
  );

  const patch = (next: Partial<AdminPressureTestData>) => {
    const merged = { ...value, ...next };
    const nextCalc = calculateAs2566PressureTest({
      v1Litres:
        (next.readings ?? merged.readings).find((row) => row.hour_index === PRESSURE_TEST_V1_HOUR)
          ?.water_added_l ?? null,
      v2Litres:
        (next.readings ?? merged.readings).find((row) => row.hour_index === PRESSURE_TEST_V2_HOUR)
          ?.water_added_l ?? null,
      lengthKm: lengthMetresToKilometres(merged.length_m),
      diameterM: merged.diameter_m,
      headM: merged.head_m ?? headFromTestPressureKpa(merged.required_pressure_kpa),
    });
    onChange({
      ...merged,
      q_litres: nextCalc.qLitres,
      allowable: nextCalc.allowable,
      verdict: nextCalc.verdict,
    });
  };

  const updateReading = (
    hour: number,
    field: "reading_time" | "water_added_l" | "pressure_kpa",
    raw: string
  ) => {
    patch({
      readings: readings.map((row) =>
        row.hour_index === hour
          ? {
              ...row,
              [field]:
                field === "reading_time"
                  ? raw
                  : raw
                    ? Number(raw)
                    : null,
            }
          : row
      ),
    });
  };

  return (
    <section className="mt-6 space-y-4">
      <div className={`${cardClass} p-4`}>
        <h3 className="text-sm font-semibold text-slate-900">AS 2566.2 Pressure Test</h3>
        <p className="text-xs text-slate-500">
          {serviceLabel}. Q = 0.14 × L × D × H. Allowable = 0.55 × V1 + Q. Pass when V2 ≤ allowable.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label>
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Start time
            </span>
            <input
              type="datetime-local"
              value={value.start_time?.slice(0, 16) ?? ""}
              onChange={(event) => patch({ start_time: event.target.value || null })}
              className={inputClass}
            />
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Starting pressure (kPa)
            </span>
            <input
              type="number"
              value={value.starting_pressure_kpa ?? ""}
              onChange={(event) =>
                patch({
                  starting_pressure_kpa: event.target.value ? Number(event.target.value) : null,
                })
              }
              className={inputClass}
            />
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Required test pressure (kPa)
            </span>
            <input
              type="number"
              value={value.required_pressure_kpa ?? ""}
              readOnly
              className={`${inputClass} bg-slate-50`}
            />
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Length L (m)
            </span>
            <input
              type="number"
              value={value.length_m ?? ""}
              onChange={(event) =>
                patch({ length_m: event.target.value ? Number(event.target.value) : null })
              }
              className={inputClass}
            />
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Diameter D (m)
            </span>
            <input
              type="number"
              step="0.001"
              value={value.diameter_m ?? ""}
              onChange={(event) =>
                patch({ diameter_m: event.target.value ? Number(event.target.value) : null })
              }
              className={inputClass}
            />
          </label>
        </div>
      </div>

      <div className={`${cardClass} overflow-hidden`}>
        <div className="border-b border-slate-200 px-4 py-3">
          <h4 className="text-sm font-semibold text-slate-900">Hourly readings</h4>
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
                    <td className="px-3 py-2 font-semibold">
                      Hour {hour}
                      {hour === PRESSURE_TEST_V1_HOUR ? " · V1" : ""}
                      {hour === PRESSURE_TEST_V2_HOUR ? " · V2" : ""}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={row.reading_time}
                        placeholder={formatHhMm()}
                        onChange={(event) =>
                          updateReading(hour, "reading_time", event.target.value)
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
                          updateReading(hour, "water_added_l", event.target.value)
                        }
                        className={inputClass}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={row.pressure_kpa ?? ""}
                        onChange={(event) =>
                          updateReading(hour, "pressure_kpa", event.target.value)
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

      <div className={`${cardClass} flex flex-wrap items-center justify-between gap-3 p-4`}>
        <div className="space-y-1 text-sm">
          <p>
            Q = <strong>{formatNum(calc.qLitres)}</strong> L
          </p>
          <p>
            Allowable = <strong>{formatNum(calc.allowable)}</strong> L
          </p>
          <p>
            Live verdict:{" "}
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-bold",
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
        <p className="text-xs text-slate-500">V1 = hour 3 water added · V2 = hour 5 water added</p>
      </div>
    </section>
  );
}
