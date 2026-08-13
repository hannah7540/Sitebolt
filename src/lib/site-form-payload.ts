import {
  isSchemaCacheColumnError,
  nullIfBlank,
  parseMissingColumnFromError,
} from "./form-payload-utils";
import {
  consolidatePayloadForTable,
  insertWithFormMetadataFallback,
  moveColumnToFormMetadata,
} from "./form-metadata-consolidation";
import type {
  SiteFormAdditionalWorker,
  SiteFormAttendee,
  SiteFormData,
  SiteFormType,
} from "./site-forms";
import { normalizeSiteFormTime } from "./site-forms";

export const SITE_FORM_TYPES: SiteFormType[] = [
  "daily_prestart",
  "toolbox_talk",
  "safety_walk",
];

export interface SiteFormInsertInput {
  formType: SiteFormType;
  projectId: string;
  workerId: string;
  formDate: string;
  formTime?: string | null;
  locationScope?: string | null;
  weatherConditions?: string | null;
  title?: string | null;
  status?: string | null;
  projectName?: string | null;
  submittedByWorkerId?: string | null;
  notes?: string | null;
  formData: SiteFormData;
  photoUrls?: string[];
  attendees?: SiteFormAttendee[];
  additionalWorkers?: SiteFormAdditionalWorker[];
  submitterSignatureUrl?: string | null;
  submittedAt?: string | null;
}

export function buildSiteFormInsertPayload(
  input: SiteFormInsertInput
): Record<string, unknown> {
  const submittedAt = input.submittedAt ?? new Date().toISOString();
  const checklistData = input.formData ?? {};

  return consolidatePayloadForTable("site_forms", {
    form_type: input.formType,
    project_id: input.projectId,
    site_id: input.projectId,
    worker_id: input.workerId,
    submitted_by_worker_id: input.submittedByWorkerId ?? input.workerId,
    submitted_at: submittedAt,
    form_date: input.formDate,
    form_time: normalizeSiteFormTime(input.formTime),
    location_scope: nullIfBlank(input.locationScope),
    weather_conditions: nullIfBlank(input.weatherConditions),
    title: nullIfBlank(input.title),
    status: nullIfBlank(input.status) ?? "Completed",
    project_name: nullIfBlank(input.projectName),
    notes: nullIfBlank(input.notes),
    form_data: checklistData,
    checklist_data: checklistData,
    photo_urls: input.photoUrls ?? [],
    attendees: input.attendees ?? [],
    additional_workers: input.additionalWorkers ?? [],
    submitter_signature_url: nullIfBlank(input.submitterSignatureUrl),
    created_at: submittedAt,
  });
}

export function isMissingSiteFormColumnError(
  message: string,
  column: string
): boolean {
  return isSchemaCacheColumnError(message, column);
}

export async function insertSiteFormRecord(
  supabase: {
    from: (table: string) => {
      insert: (values: Record<string, unknown>[]) => {
        select: (columns: string) => {
          single: () => PromiseLike<{
            data: { id?: string } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  },
  input: SiteFormInsertInput
): Promise<{ error: string | null; id: string | null }> {
  const payload = buildSiteFormInsertPayload(input);
  const result = await insertWithFormMetadataFallback(supabase, "site_forms", payload, "id");
  return { error: result.error, id: result.data?.id ?? null };
}

export function buildSiteFormTestPayload(
  ctx: {
    projectId: string;
    projectName: string;
    workerId: string;
    workerName: string;
  },
  formType: SiteFormType,
  formData: Record<string, unknown>,
  tag: string
): Record<string, unknown> {
  const formDate = new Date().toISOString().slice(0, 10);
  return buildSiteFormInsertPayload({
    formType,
    projectId: ctx.projectId,
    workerId: ctx.workerId,
    formDate,
    formTime: "06:30:00",
    locationScope: "Site wide",
    weatherConditions: "Clear",
    title:
      formType === "safety_walk"
        ? "Site Safety Walk"
        : formType === "toolbox_talk"
          ? "Toolbox Talk"
          : "Daily Pre-Start Meeting",
    status: "Completed",
    projectName: ctx.projectName || "Test Project",
    notes: `${tag} automated site form submission`,
    formData: formData as SiteFormData,
    photoUrls: [],
    attendees: [
      {
        worker_id: ctx.workerId,
        worker_name: ctx.workerName,
        present: true,
        signature_url: "https://example.com/form-test-signature.png",
      },
    ],
    additionalWorkers: [],
    submitterSignatureUrl: "https://example.com/form-test-signature.png",
  });
}

export async function postSiteFormRecordPayload(
  env: { url: string; anonKey: string },
  payload: Record<string, unknown>
): Promise<{ status: number; id: string | null; error: string | null }> {
  let attemptPayload = consolidatePayloadForTable("site_forms", payload);

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const response = await fetch(`${env.url}/rest/v1/site_forms`, {
      method: "POST",
      headers: {
        apikey: env.anonKey,
        Authorization: `Bearer ${env.anonKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(attemptPayload),
    });

    const text = await response.text();

    if (response.status >= 200 && response.status < 300) {
      let id: string | null = null;
      try {
        const parsed = JSON.parse(text) as Array<{ id?: string }>;
        id = parsed[0]?.id ?? null;
      } catch {
        id = null;
      }
      return { status: response.status, id, error: null };
    }

    const missingColumn = parseMissingColumnFromError(text);
    if (!missingColumn || !(missingColumn in attemptPayload)) {
      return { status: response.status, id: null, error: text };
    }

    attemptPayload = consolidatePayloadForTable(
      "site_forms",
      moveColumnToFormMetadata(attemptPayload, missingColumn)
    );
  }

  return {
    status: 500,
    id: null,
    error: "Failed to insert site form after form_metadata fallbacks.",
  };
}

export const SITE_FORM_TEST_CHECKLIST: Record<
  SiteFormType,
  Record<string, unknown>
> = {
  daily_prestart: {
    client: "A Plus",
    scope_of_works: ["Excavate"],
    a_plus_location_description: "E2E pre-start location",
    related_swms: ["Other"],
    correct_permits_required: "yes",
    confirm_siting_itcs: "yes",
    significant_hazards: ["None"],
  },
  toolbox_talk: {
    toolbox_subject: "E2E toolbox subject",
    comments_points_raised: "E2E toolbox discussion points",
    related_swms: ["Hot works"],
  },
  safety_walk: {
    client: "A Plus",
    description_of_works: "E2E safety walk observation",
    cleanliness: "yes",
    material_storage: "yes",
    plant: "na",
    permits_excavation: "na",
    permits_hot_works: "na",
    permits_power_tools: "yes",
    permits_confined_space: "na",
    hazards_to_report: "no",
  },
};
