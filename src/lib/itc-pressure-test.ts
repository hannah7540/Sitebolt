export const PRESSURE_TEST_HOURS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;
export const PRESSURE_TEST_V1_HOUR = 3;
export const PRESSURE_TEST_V2_HOUR = 5;
export const AS2566_Q_COEFFICIENT = 0.14;
export const AS2566_V1_COEFFICIENT = 0.55;
export const WATER_HEAD_GRAVITY = 9.80665;
export const PRESSURE_TEST_ACCENT = "#F48120";
export const PRESSURE_TEST_DUE_ALERT_MINUTES = 15;

export type PressureTestVerdict = "PASS" | "FAIL" | "WAIT";

export interface PressureReadingInput {
  hour_index: number;
  reading_time: string;
  water_added_l: number | null;
  pressure_kpa: number | null;
}

export interface PressureTestCalcInput {
  v1Litres: number | null;
  v2Litres: number | null;
  lengthKm: number | null;
  diameterM: number | null;
  headM: number | null;
}

export interface PressureTestCalcResult {
  qLitres: number | null;
  allowable: number | null;
  passed: boolean | null;
  verdict: PressureTestVerdict;
  complete: boolean;
}

export function roundPressureLitres(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function lengthMetresToKilometres(lengthM: number | null | undefined): number | null {
  if (lengthM == null || !Number.isFinite(Number(lengthM))) return null;
  return roundPressureLitres(Number(lengthM) / 1000, 6);
}

export function headFromTestPressureKpa(pressureKpa: number | null | undefined): number | null {
  if (pressureKpa == null || !Number.isFinite(Number(pressureKpa))) return null;
  return roundPressureLitres(Number(pressureKpa) / WATER_HEAD_GRAVITY, 4);
}

/** Warn when the value looks like millimetres / DN rather than metres (e.g. 150 instead of 0.150). */
export function diameterLooksLikeNominalSize(diameterM: number | null | undefined): boolean {
  if (diameterM == null || !Number.isFinite(Number(diameterM))) return false;
  return Number(diameterM) >= 1;
}

export function waterAddedAtHour(
  readings: PressureReadingInput[],
  hourIndex: number
): number | null {
  const row = readings.find((item) => item.hour_index === hourIndex);
  if (!row || row.water_added_l == null || !Number.isFinite(row.water_added_l)) return null;
  return row.water_added_l;
}

export function calculateAs2566PressureTest(
  input: PressureTestCalcInput
): PressureTestCalcResult {
  const v1 = input.v1Litres;
  const v2 = input.v2Litres;
  const lengthKm = input.lengthKm;
  const diameterM = input.diameterM;
  const headM = input.headM;

  const complete =
    v1 != null &&
    Number.isFinite(v1) &&
    v2 != null &&
    Number.isFinite(v2) &&
    lengthKm != null &&
    Number.isFinite(lengthKm) &&
    lengthKm > 0 &&
    diameterM != null &&
    Number.isFinite(diameterM) &&
    diameterM > 0 &&
    headM != null &&
    Number.isFinite(headM) &&
    headM > 0;

  if (!complete) {
    const qLitres =
      lengthKm != null &&
      diameterM != null &&
      headM != null &&
      Number.isFinite(lengthKm) &&
      Number.isFinite(diameterM) &&
      Number.isFinite(headM)
        ? roundPressureLitres(AS2566_Q_COEFFICIENT * lengthKm * diameterM * headM)
        : null;
    const allowable =
      v1 != null && Number.isFinite(v1) && qLitres != null
        ? roundPressureLitres(AS2566_V1_COEFFICIENT * v1 + qLitres)
        : null;
    return {
      qLitres,
      allowable,
      passed: null,
      verdict: "WAIT",
      complete: false,
    };
  }

  const qLitres = roundPressureLitres(
    AS2566_Q_COEFFICIENT * lengthKm * diameterM * headM
  );
  const allowable = roundPressureLitres(AS2566_V1_COEFFICIENT * v1 + qLitres);
  const passed = v2 <= allowable;

  return {
    qLitres,
    allowable,
    passed,
    verdict: passed ? "PASS" : "FAIL",
    complete: true,
  };
}

export function formatHhMm(date: Date = new Date()): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function parseReadingTimeToMinutes(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function nextDuePressureReading(input: {
  startTimeIso: string | null;
  readings: PressureReadingInput[];
  now?: Date;
}): {
  hourIndex: number;
  dueAt: Date;
  remainingMs: number;
  isNow: boolean;
  isAlert: boolean;
  label: string;
} | null {
  if (!input.startTimeIso) return null;
  const start = new Date(input.startTimeIso);
  if (Number.isNaN(start.getTime())) return null;

  const now = input.now ?? new Date();
  const recorded = new Set(
    input.readings
      .filter((row) => row.reading_time.trim())
      .map((row) => row.hour_index)
  );

  const hourIndex = PRESSURE_TEST_HOURS.find((hour) => !recorded.has(hour));
  if (hourIndex == null) return null;

  const dueAt = new Date(start.getTime() + hourIndex * 60 * 60 * 1000);
  const remainingMs = dueAt.getTime() - now.getTime();
  const remainingMinutes = Math.ceil(remainingMs / 60000);
  const isNow = remainingMs <= 0;
  const isAlert = remainingMinutes <= PRESSURE_TEST_DUE_ALERT_MINUTES;

  let label: string;
  if (isNow) {
    label = `Hour ${hourIndex} reading due NOW`;
  } else if (isAlert) {
    label = `Hour ${hourIndex} reading due in ${Math.max(1, remainingMinutes)} min`;
  } else {
    label = `Next reading (Hour ${hourIndex}) due at ${formatHhMm(dueAt)}`;
  }

  return { hourIndex, dueAt, remainingMs, isNow, isAlert, label };
}

export function emptyPressureReadings(): PressureReadingInput[] {
  return PRESSURE_TEST_HOURS.map((hour) => ({
    hour_index: hour,
    reading_time: "",
    water_added_l: null,
    pressure_kpa: null,
  }));
}
