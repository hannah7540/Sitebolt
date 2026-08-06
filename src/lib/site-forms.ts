export type SiteFormType = "daily_prestart" | "toolbox_talk" | "safety_walk";

export type SiteFormFieldValue = string | boolean | string[] | null;

export type SiteFormData = Record<string, SiteFormFieldValue>;

export type SiteFormFieldType =
  | "text"
  | "textarea"
  | "client_select"
  | "multi_select"
  | "multi_select_other"
  | "yes_no_na"
  | "yes_na"
  | "yes_no"
  | "tri_state_with_photo"
  | "yes_no_with_photo";

export interface SiteFormFieldDef {
  id: string;
  label: string;
  type: SiteFormFieldType;
  placeholder?: string;
  required?: boolean;
  options?: readonly string[];
  otherFieldId?: string;
  photoFieldId?: string;
}

export interface SiteFormSection {
  id: string;
  title: string;
  fields: SiteFormFieldDef[];
}

export interface SiteFormAttendee {
  worker_id: string;
  worker_name: string;
  present: boolean;
  signature_url: string | null;
}

export interface SiteFormAdditionalWorker {
  name: string;
  signature: string;
}

export interface SiteFormSubmission {
  id: string;
  form_type: SiteFormType;
  project_id: string;
  worker_id: string;
  submitted_at: string;
  form_date: string;
  form_time: string | null;
  location_scope: string | null;
  checklist_data?: SiteFormData;
  form_data: SiteFormData;
  photo_urls: string[];
  attendees: SiteFormAttendee[];
  additional_workers: SiteFormAdditionalWorker[];
  submitter_signature_url: string | null;
  created_at?: string;
}

export const CLIENT_OPTIONS = ["A Plus", "CDC"] as const;

export const SCOPE_OF_WORKS_OPTIONS = [
  "Excavate",
  "Backfill",
  "Install",
  "Testing",
  "Commissioning",
  "Other",
] as const;

export const RELATED_SWMS_OPTIONS = [
  "Work on or near services",
  "Work in an area with powered mobile plant",
  "Trench or excavation over 1.5m",
  "Risk of fall > 2m",
  "Respirable Crystalline Silica",
  "EWP (Elevated work platform)",
  "Work adjacent to a traffic corridor",
  "Work in or near a confined space",
  "Work likely to disturb asbestos",
  "Other",
] as const;

export const PERMITS_IN_PLACE_OPTIONS = [
  "Excavation",
  "Hot works",
  "Confined Space",
  "Concrete cutting or coring",
  "Service isolation",
  "Working at heights",
  "Use of harness",
  "A-Frame ladder use",
  "Asbestos removal",
] as const;

export const SIGNIFICANT_HAZARDS_OPTIONS = [
  "Moving plant",
  "Slips, trips and falls",
  "Manual handling",
  "Excavation around live services",
  "Working with power tools",
  "Falls from height",
  "Inclement weather",
  "Hot works",
  "None",
  "Other",
] as const;

export const SITE_FORM_LABELS: Record<SiteFormType, string> = {
  daily_prestart: "Daily Pre-Start Meeting",
  toolbox_talk: "Toolbox Talk",
  safety_walk: "Safety Walk",
};

export const SITE_FORM_SHORT_LABELS: Record<SiteFormType, string> = {
  daily_prestart: "Pre-Start",
  toolbox_talk: "Toolbox",
  safety_walk: "Safety Walk",
};

export const SITE_FORM_CONFIGS: Record<
  SiteFormType,
  {
    description: string;
    sections: SiteFormSection[];
  }
> = {
  daily_prestart: {
    description:
      "Record the daily pre-start meeting, SWMS review, permits, and site hazards.",
    sections: [
      {
        id: "project_details",
        title: "Project details",
        fields: [
          {
            id: "client",
            label: "Client",
            type: "client_select",
            required: true,
          },
          {
            id: "scope_of_works",
            label: "Scope of works",
            type: "multi_select_other",
            options: SCOPE_OF_WORKS_OPTIONS,
            otherFieldId: "scope_of_works_other",
            required: true,
          },
          {
            id: "a_plus_location_description",
            label: "A Plus location & description of works",
            type: "textarea",
            placeholder: "Location and description of today's works…",
            required: true,
          },
        ],
      },
      {
        id: "swms_permits",
        title: "SWMS & permits",
        fields: [
          {
            id: "related_swms",
            label: "Related SWMS",
            type: "multi_select_other",
            options: RELATED_SWMS_OPTIONS,
            otherFieldId: "related_swms_other",
          },
          {
            id: "correct_permits_required",
            label: "Correct permits required",
            type: "yes_na",
            required: true,
          },
          {
            id: "permits_in_place",
            label: "Permits in place",
            type: "multi_select",
            options: PERMITS_IN_PLACE_OPTIONS,
          },
          {
            id: "confirm_siting_itcs",
            label: "Confirm siting ITCs prior to works",
            type: "yes_no_na",
            required: true,
          },
        ],
      },
      {
        id: "hazards",
        title: "Significant hazards",
        fields: [
          {
            id: "significant_hazards",
            label: "Significant hazards",
            type: "multi_select_other",
            options: SIGNIFICANT_HAZARDS_OPTIONS,
            otherFieldId: "significant_hazards_other",
            required: true,
          },
        ],
      },
    ],
  },
  toolbox_talk: {
    description: "Document the toolbox talk topic, comments, and related SWMS.",
    sections: [
      {
        id: "toolbox_details",
        title: "Toolbox talk details",
        fields: [
          {
            id: "toolbox_subject",
            label: "Toolbox talk subject",
            type: "text",
            placeholder: "Subject discussed…",
            required: true,
          },
          {
            id: "comments_points_raised",
            label: "Comments and points raised",
            type: "textarea",
            placeholder: "Key comments and discussion points…",
            required: true,
          },
          {
            id: "related_swms",
            label: "Related SWMS",
            type: "multi_select_other",
            options: RELATED_SWMS_OPTIONS,
            otherFieldId: "related_swms_other",
          },
        ],
      },
    ],
  },
  safety_walk: {
    description:
      "Record site inspection findings, permits held, and hazards to report.",
    sections: [
      {
        id: "walk_details",
        title: "Walk details",
        fields: [
          {
            id: "client",
            label: "Client",
            type: "client_select",
            required: true,
          },
          {
            id: "description_of_works",
            label: "Description of works",
            type: "textarea",
            placeholder: "Describe works observed during the walk…",
            required: true,
          },
        ],
      },
      {
        id: "site_conditions",
        title: "Site conditions",
        fields: [
          {
            id: "cleanliness",
            label: "Cleanliness (work front free of rubbish/debris)",
            type: "tri_state_with_photo",
            photoFieldId: "cleanliness_photo_url",
            required: true,
          },
          {
            id: "material_storage",
            label: "Material storage (stored safe and secure)",
            type: "tri_state_with_photo",
            photoFieldId: "material_storage_photo_url",
            required: true,
          },
          {
            id: "plant",
            label: "Plant (task requires use of plant)",
            type: "tri_state_with_photo",
            photoFieldId: "plant_photo_url",
            required: true,
          },
        ],
      },
      {
        id: "permits_held",
        title: "Permits held",
        fields: [
          {
            id: "permits_excavation",
            label: "Excavation",
            type: "yes_na",
            required: true,
          },
          {
            id: "permits_hot_works",
            label: "Hot works",
            type: "yes_na",
            required: true,
          },
          {
            id: "permits_power_tools",
            label: "Power tools",
            type: "yes_na",
            required: true,
          },
          {
            id: "permits_confined_space",
            label: "Confined space",
            type: "yes_na",
            required: true,
          },
        ],
      },
      {
        id: "hazards",
        title: "Hazards",
        fields: [
          {
            id: "hazards_to_report",
            label: "Hazards to report on site",
            type: "yes_no_with_photo",
            photoFieldId: "hazards_to_report_photo_url",
            required: true,
          },
        ],
      },
    ],
  },
};

export function getSiteFormFields(formType: SiteFormType): SiteFormFieldDef[] {
  const fields: SiteFormFieldDef[] = [];
  for (const section of SITE_FORM_CONFIGS[formType].sections) {
    for (const field of section.fields) {
      fields.push(field);
    }
  }
  return fields;
}

export function defaultFormData(formType: SiteFormType): SiteFormData {
  const data: SiteFormData = {};
  for (const field of getSiteFormFields(formType)) {
    if (field.type === "multi_select" || field.type === "multi_select_other") {
      data[field.id] = [];
    } else if (field.type === "yes_no") {
      data[field.id] = false;
    } else {
      data[field.id] = "";
    }
    if (field.otherFieldId) {
      data[field.otherFieldId] = "";
    }
  }
  return data;
}

export function getFormDataLabel(formType: SiteFormType, fieldId: string): string {
  for (const section of SITE_FORM_CONFIGS[formType].sections) {
    for (const field of section.fields) {
      if (field.id === fieldId) return field.label;
      if (field.otherFieldId === fieldId) {
        return `${field.label} — other (specify)`;
      }
      if (field.photoFieldId === fieldId) {
        return `${field.label} — photo`;
      }
    }
  }
  return fieldId.replace(/_/g, " ");
}

export function isPhotoFormDataKey(key: string): boolean {
  return key.endsWith("_photo_url");
}

export function formatFormDataValue(value: SiteFormFieldValue): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : "—";
  }
  if (value === "yes") return "Yes";
  if (value === "no") return "No";
  if (value === "na") return "N/A";
  return String(value);
}

export function formatSiteFormDate(isoDate: string): string {
  try {
    return new Date(`${isoDate}T12:00:00`).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return isoDate;
  }
}

export function isInternalFormDataKey(key: string): boolean {
  return isPhotoFormDataKey(key) || key.endsWith("_other");
}
