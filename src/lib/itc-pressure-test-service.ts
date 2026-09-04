import { supabase, isSupabaseConfigured } from "./supabase";
import { PLANT_DOCUMENTS_BUCKET } from "./plant-doc-upload";
import {
  isSupabaseRelationMissingError,
  logSupabaseTableUnavailable,
  toSupabaseRequestError,
} from "./supabase-errors";
import { nullIfBlank, sanitizeWritePayload } from "./form-payload-utils";
import {
  calculateAs2566PressureTest,
  emptyPressureReadings,
  type PressureReadingInput,
  type PressureTestCalcResult,
} from "./itc-pressure-test";
import {
  submitItcSignoff,
  upsertItcSignoffDraft,
} from "./itc-service";

export type PressureSignatureType = "aplus" | "pc";

export interface PressureTestRow {
  id: string;
  itc_id: string;
  project_id: string;
  start_time: string | null;
  required_pressure_kpa: number | null;
  v1_litres: number | null;
  v2_litres: number | null;
  v1_overridden: boolean;
  v2_overridden: boolean;
  length_km: number | null;
  diameter_m: number | null;
  head_m: number | null;
  q_litres: number | null;
  allowable: number | null;
  passed: boolean | null;
  aplus_sig: string | null;
  pc_sig: string | null;
  submitted_at: string | null;
  submitted_by: string | null;
  created_at?: string;
  updated_at?: string;
  readings: PressureReadingInput[];
}

export interface SavePressureTestInput {
  testId?: string | null;
  itcId: string;
  projectId: string;
  startTime: string | null;
  requiredPressureKpa: number | null;
  v1Litres: number | null;
  v2Litres: number | null;
  v1Overridden: boolean;
  v2Overridden: boolean;
  lengthKm: number | null;
  diameterM: number | null;
  headM: number | null;
  readings: PressureReadingInput[];
  aplusSigDataUrl?: string | null;
  pcSigDataUrl?: string | null;
  existingAplusSig?: string | null;
  existingPcSig?: string | null;
  submit?: boolean;
  submittedBy?: string | null;
  submittedByName?: string | null;
  stepIndex?: number;
  autoVerify?: boolean;
}

function toNullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeReading(row: Record<string, unknown>): PressureReadingInput {
  return {
    hour_index: Number(row.hour_index ?? 0),
    reading_time: String(row.reading_time ?? "").slice(0, 5),
    water_added_l: toNullableNumber(row.water_added_l),
    pressure_kpa: toNullableNumber(row.pressure_kpa),
  };
}

function normalizeTest(
  row: Record<string, unknown>,
  readings: PressureReadingInput[] = emptyPressureReadings()
): PressureTestRow {
  const byHour = new Map(readings.map((item) => [item.hour_index, item]));
  return {
    id: String(row.id),
    itc_id: String(row.itc_id ?? ""),
    project_id: String(row.project_id ?? ""),
    start_time: row.start_time ? String(row.start_time) : null,
    required_pressure_kpa: toNullableNumber(row.required_pressure_kpa),
    v1_litres: toNullableNumber(row.v1_litres),
    v2_litres: toNullableNumber(row.v2_litres),
    v1_overridden: row.v1_overridden === true,
    v2_overridden: row.v2_overridden === true,
    length_km: toNullableNumber(row.length_km),
    diameter_m: toNullableNumber(row.diameter_m),
    head_m: toNullableNumber(row.head_m),
    q_litres: toNullableNumber(row.q_litres),
    allowable: toNullableNumber(row.allowable),
    passed: typeof row.passed === "boolean" ? row.passed : null,
    aplus_sig: row.aplus_sig ? String(row.aplus_sig) : null,
    pc_sig: row.pc_sig ? String(row.pc_sig) : null,
    submitted_at: row.submitted_at ? String(row.submitted_at) : null,
    submitted_by: row.submitted_by ? String(row.submitted_by) : null,
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
    readings: emptyPressureReadings().map((slot) => byHour.get(slot.hour_index) ?? slot),
  };
}

export async function fetchLatestPressureTest(
  itcId: string
): Promise<PressureTestRow | null> {
  if (!isSupabaseConfigured() || !itcId.trim()) return null;

  const { data, error } = await supabase
    .from("pressure_tests")
    .select("*")
    .eq("itc_id", itcId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    if (!isSupabaseRelationMissingError(toSupabaseRequestError(error))) {
      console.warn("fetchLatestPressureTest failed:", error.message);
    } else {
      logSupabaseTableUnavailable("fetchLatestPressureTest", "pressure_tests", error);
    }
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  const { data: readingRows } = await supabase
    .from("pressure_readings")
    .select("*")
    .eq("test_id", (row as { id: string }).id)
    .order("hour_index");

  return normalizeTest(
    row as Record<string, unknown>,
    (readingRows ?? []).map((row) => normalizeReading(row as Record<string, unknown>))
  );
}

export async function uploadPressureTestSignature(
  testId: string,
  representativeType: PressureSignatureType,
  dataUrl: string
): Promise<{ url: string | null; error: string | null }> {
  try {
    const blob = await fetch(dataUrl).then((response) => response.blob());
    const path = `itc-signatures/${testId}/${representativeType}.png`;
    const { error } = await supabase.storage.from(PLANT_DOCUMENTS_BUCKET).upload(path, blob, {
      upsert: true,
      contentType: "image/png",
    });
    if (error) return { url: null, error: error.message };
    const { data } = supabase.storage.from(PLANT_DOCUMENTS_BUCKET).getPublicUrl(path);
    return { url: `${data.publicUrl}?t=${Date.now()}`, error: null };
  } catch (cause) {
    return {
      url: null,
      error: cause instanceof Error ? cause.message : "Signature upload failed.",
    };
  }
}

async function replaceReadings(
  testId: string,
  readings: PressureReadingInput[]
): Promise<{ error: string | null }> {
  const now = new Date().toISOString();
  const rows = readings.map((row) =>
    sanitizeWritePayload({
      test_id: testId,
      hour_index: row.hour_index,
      reading_time: nullIfBlank(row.reading_time),
      water_added_l: row.water_added_l,
      pressure_kpa: row.pressure_kpa,
      updated_at: now,
    })
  );

  const { error } = await supabase.from("pressure_readings").upsert(rows, {
    onConflict: "test_id,hour_index",
  });
  return { error: error?.message ?? null };
}

async function raisePressureTestNcr(input: {
  itcId: string;
  testId: string;
  projectId: string;
  raisedBy: string | null;
}): Promise<void> {
  const { error } = await supabase.from("ncrs").insert([
    {
      itc_id: input.itcId,
      test_id: input.testId,
      project_id: input.projectId,
      cause: "Test failure",
      status: "open",
      raised_by: input.raisedBy,
      details: "Automatic NCR from AS 2566.2 hydraulic pressure test failure.",
    },
  ]);
  if (error && !isSupabaseRelationMissingError(toSupabaseRequestError(error))) {
    console.warn("raisePressureTestNcr failed:", error.message);
  }
}

async function markPressureTestStepSubmitted(input: {
  itcId: string;
  stepIndex: number;
  authorId: string;
  authorName: string;
  signatureUrl: string | null;
  calc: PressureTestCalcResult;
  autoVerify?: boolean;
}): Promise<{ error: string | null }> {
  const draft = await upsertItcSignoffDraft({
    itcId: input.itcId,
    stepKey: "pressure_test",
    stepIndex: input.stepIndex,
    authorId: input.authorId,
    authorName: input.authorName,
    comments: input.calc.verdict,
    fieldData: {
      outcome: input.calc.passed ? "Pass" : "Fail",
      q_litres: input.calc.qLitres,
      allowable: input.calc.allowable,
      passed: input.calc.passed,
    },
    signatureUrl: input.signatureUrl,
  });
  if (draft.error || !draft.signoff) {
    return { error: draft.error ?? "Unable to save pressure test sign-off." };
  }

  return submitItcSignoff({
    signoffId: draft.signoff.id,
    itcId: input.itcId,
    signedByWorkerId: input.authorId,
    autoVerify: input.autoVerify,
    verifiedBy: input.autoVerify ? input.authorId : undefined,
    verifiedByName: input.autoVerify ? input.authorName : undefined,
  });
}

export async function savePressureTest(
  input: SavePressureTestInput
): Promise<{ error: string | null; test: PressureTestRow | null }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured.", test: null };
  }

  const calc = calculateAs2566PressureTest({
    v1Litres: input.v1Litres,
    v2Litres: input.v2Litres,
    lengthKm: input.lengthKm,
    diameterM: input.diameterM,
    headM: input.headM,
  });

  if (input.submit) {
    if (!calc.complete || calc.qLitres == null || calc.allowable == null || calc.passed == null) {
      return {
        error: "Complete V1, V2, L, D, and H before submitting the pressure test.",
        test: null,
      };
    }
    if (!input.aplusSigDataUrl && !input.existingAplusSig) {
      return {
        error: "Subcontractor representative signature is required.",
        test: null,
      };
    }
  }

  const now = new Date().toISOString();
  const payload = sanitizeWritePayload({
    itc_id: input.itcId,
    project_id: input.projectId,
    start_time: input.startTime,
    required_pressure_kpa: input.requiredPressureKpa,
    v1_litres: input.v1Litres,
    v2_litres: input.v2Litres,
    v1_overridden: input.v1Overridden,
    v2_overridden: input.v2Overridden,
    length_km: input.lengthKm,
    diameter_m: input.diameterM,
    head_m: input.headM,
    q_litres: input.submit ? calc.qLitres : calc.qLitres,
    allowable: input.submit ? calc.allowable : calc.allowable,
    passed: input.submit ? calc.passed : null,
    submitted_at: input.submit ? now : null,
    submitted_by: input.submit ? input.submittedBy ?? null : null,
    updated_at: now,
  });

  let testId = input.testId?.trim() || "";

  if (testId) {
    const { data, error } = await supabase
      .from("pressure_tests")
      .update(payload)
      .eq("id", testId)
      .select("*")
      .maybeSingle();
    if (error || !data) {
      return { error: error?.message ?? "Failed to update pressure test.", test: null };
    }
    testId = String((data as { id: string }).id);
  } else {
    const { data, error } = await supabase
      .from("pressure_tests")
      .insert([payload])
      .select("*")
      .maybeSingle();
    if (error || !data) {
      if (error && isSupabaseRelationMissingError(toSupabaseRequestError(error))) {
        logSupabaseTableUnavailable("savePressureTest", "pressure_tests", error);
        return {
          error: "Pressure test tables are not available. Run migration 150_hydraulic_pressure_tests.sql.",
          test: null,
        };
      }
      return { error: error?.message ?? "Failed to create pressure test.", test: null };
    }
    testId = String((data as { id: string }).id);
  }

  let aplusSig = input.existingAplusSig ?? null;
  let pcSig = input.existingPcSig ?? null;

  if (input.aplusSigDataUrl) {
    const upload = await uploadPressureTestSignature(testId, "aplus", input.aplusSigDataUrl);
    if (!upload.url) return { error: upload.error ?? "Failed to upload subcontractor signature.", test: null };
    aplusSig = upload.url;
  }
  if (input.pcSigDataUrl) {
    const upload = await uploadPressureTestSignature(testId, "pc", input.pcSigDataUrl);
    if (!upload.url) return { error: upload.error ?? "Failed to upload principal contractor signature.", test: null };
    pcSig = upload.url;
  }

  if (aplusSig || pcSig) {
    await supabase
      .from("pressure_tests")
      .update({ aplus_sig: aplusSig, pc_sig: pcSig, updated_at: now })
      .eq("id", testId);
  }

  const readingsResult = await replaceReadings(testId, input.readings);
  if (readingsResult.error) {
    return { error: readingsResult.error, test: null };
  }

  if (input.submit && calc.passed === false) {
    await raisePressureTestNcr({
      itcId: input.itcId,
      testId,
      projectId: input.projectId,
      raisedBy: input.submittedBy ?? null,
    });
    await supabase
      .from("project_itcs")
      .update({ status: "issue", updated_at: now })
      .eq("id", input.itcId);
  }

  if (input.submit && input.submittedBy) {
    const stepResult = await markPressureTestStepSubmitted({
      itcId: input.itcId,
      stepIndex: input.stepIndex ?? 4,
      authorId: input.submittedBy,
      authorName: input.submittedByName ?? "ITC user",
      signatureUrl: aplusSig,
      calc,
      autoVerify: input.autoVerify,
    });
    if (
      stepResult.error &&
      !stepResult.error.toLowerCase().includes("locked") &&
      !stepResult.error.toLowerCase().includes("change request")
    ) {
      return { error: stepResult.error, test: null };
    }
    if (calc.passed === false) {
      await supabase
        .from("project_itcs")
        .update({ status: "issue", updated_at: now })
        .eq("id", input.itcId);
    }
  }

  const saved = await fetchLatestPressureTest(input.itcId);
  return { error: null, test: saved };
}
