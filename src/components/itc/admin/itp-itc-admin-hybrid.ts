import {
  ADMIN_ITC_PHOTO_SLOTS,
  type AdminItcPhotoSlot,
  type AdminItcPhotoSlotId,
  type AdminItcSignoff,
  type AdminPressureReading,
  type AdminPressureTestData,
} from "@/components/itc/admin/itp-itc-admin-types";
import {
  emptyPressureReadings,
  PRESSURE_TEST_HOURS,
  type PressureReadingInput,
} from "@/lib/itc-pressure-test";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function emptyAdminPhotoSlots(): Record<AdminItcPhotoSlotId, AdminItcPhotoSlot> {
  return ADMIN_ITC_PHOTO_SLOTS.reduce(
    (acc, slot) => {
      acc[slot.id] = {
        id: slot.id,
        url: null,
        path: null,
        captured_at: null,
        file_size: null,
        not_required: false,
      };
      return acc;
    },
    {} as Record<AdminItcPhotoSlotId, AdminItcPhotoSlot>
  );
}

export function mapAdminPhotoSlots(raw: unknown): Record<AdminItcPhotoSlotId, AdminItcPhotoSlot> {
  const base = emptyAdminPhotoSlots();
  const source = asRecord(raw);
  for (const slot of ADMIN_ITC_PHOTO_SLOTS) {
    const row = asRecord(source[slot.id]);
    const url =
      typeof row.url === "string"
        ? row.url
        : typeof row.photo_url === "string"
          ? row.photo_url
          : null;
    const path = typeof row.path === "string" ? row.path : url;
    base[slot.id] = {
      id: slot.id,
      url,
      path,
      captured_at: typeof row.captured_at === "string" ? row.captured_at : null,
      file_size:
        typeof row.file_size === "number" && Number.isFinite(row.file_size)
          ? row.file_size
          : null,
      not_required: row.not_required === true,
    };
  }
  return base;
}

export function photoSlotsSatisfied(
  slots: Record<string, AdminItcPhotoSlot> | null | undefined
): boolean {
  const current = slots ?? emptyAdminPhotoSlots();
  return ADMIN_ITC_PHOTO_SLOTS.every((slot) => {
    const row = current[slot.id];
    if (!row) return false;
    if (slot.allowNa && row.not_required) return true;
    return Boolean(row.url);
  });
}

export function emptyAdminSignoff(defaults?: Partial<AdminItcSignoff>): AdminItcSignoff {
  return {
    company: defaults?.company ?? null,
    full_name: defaults?.full_name ?? null,
    position: defaults?.position ?? null,
    signature_url: defaults?.signature_url ?? null,
    signed_at: defaults?.signed_at ?? null,
  };
}

export function mapAdminSignoff(raw: unknown, fallback?: Partial<AdminItcSignoff>): AdminItcSignoff {
  if (typeof raw === "string" && raw.trim()) {
    return emptyAdminSignoff({
      ...fallback,
      signature_url: raw,
    });
  }
  const row = asRecord(raw);
  return emptyAdminSignoff({
    company: typeof row.company === "string" ? row.company : fallback?.company ?? null,
    full_name:
      typeof row.full_name === "string"
        ? row.full_name
        : fallback?.full_name ?? null,
    position: typeof row.position === "string" ? row.position : fallback?.position ?? null,
    signature_url:
      typeof row.signature_url === "string"
        ? row.signature_url
        : fallback?.signature_url ?? null,
    signed_at: typeof row.signed_at === "string" ? row.signed_at : fallback?.signed_at ?? null,
  });
}

export function emptyAdminPressureTest(input?: {
  requiredKpa?: number | null;
  diameterM?: number | null;
}): AdminPressureTestData {
  return {
    start_time: null,
    starting_pressure_kpa: null,
    required_pressure_kpa: input?.requiredKpa ?? null,
    length_m: null,
    diameter_m: input?.diameterM ?? null,
    head_m: null,
    readings: emptyPressureReadings().map((row) => ({ ...row })),
    q_litres: null,
    allowable: null,
    verdict: "WAIT",
  };
}

export function mapAdminPressureTest(raw: unknown): AdminPressureTestData {
  const row = asRecord(raw);
  const readingsRaw = Array.isArray(row.readings) ? row.readings : [];
  const readings: AdminPressureReading[] = PRESSURE_TEST_HOURS.map((hour) => {
    const match = readingsRaw
      .map((item) => asRecord(item))
      .find((item) => Number(item.hour_index) === hour);
    return {
      hour_index: hour,
      reading_time: typeof match?.reading_time === "string" ? match.reading_time : "",
      water_added_l:
        match?.water_added_l == null ? null : Number(match.water_added_l) || null,
      pressure_kpa: match?.pressure_kpa == null ? null : Number(match.pressure_kpa) || null,
    };
  });
  return {
    start_time: typeof row.start_time === "string" ? row.start_time : null,
    starting_pressure_kpa:
      row.starting_pressure_kpa == null ? null : Number(row.starting_pressure_kpa) || null,
    required_pressure_kpa:
      row.required_pressure_kpa == null ? null : Number(row.required_pressure_kpa) || null,
    length_m: row.length_m == null ? null : Number(row.length_m) || null,
    diameter_m: row.diameter_m == null ? null : Number(row.diameter_m) || null,
    head_m: row.head_m == null ? null : Number(row.head_m) || null,
    readings: readings.length ? readings : emptyPressureReadings(),
    q_litres: row.q_litres == null ? null : Number(row.q_litres) || null,
    allowable: row.allowable == null ? null : Number(row.allowable) || null,
    verdict:
      row.verdict === "PASS" || row.verdict === "FAIL" || row.verdict === "WAIT"
        ? row.verdict
        : "WAIT",
  };
}

export function toPressureReadings(
  readings: AdminPressureReading[]
): PressureReadingInput[] {
  return readings.map((row) => ({
    hour_index: row.hour_index,
    reading_time: row.reading_time,
    water_added_l: row.water_added_l,
    pressure_kpa: row.pressure_kpa,
  }));
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function pathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).pathname.replace(/^\/storage\/v1\/object\/public\/itc-photos\//, "");
  } catch {
    return url;
  }
}
