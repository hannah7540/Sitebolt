import {
  fetchCustomFormTemplates,
  saveCustomFormTemplate,
  type CustomFormAnswers,
  type CustomFormField,
  type CustomFormTemplate,
  type CustomFormTemplateInput,
} from "./custom-forms";

export const HIGH_FIDELITY_FORM_KEYS = {
  riskAssessment: "risk_assessment",
  confinedSpace: "confined_space_entry",
} as const;

export type HighFidelityFormKey =
  (typeof HIGH_FIDELITY_FORM_KEYS)[keyof typeof HIGH_FIDELITY_FORM_KEYS];

export const HIGH_FIDELITY_FORM_TITLES = {
  riskAssessment: "Risk Assessment",
  confinedSpace: "Confined Space Entry Permit",
} as const;

const SYSTEM_STATEMENT_FIELD: CustomFormField = {
  id: "system-ui-notice",
  kind: "statement",
  type: "statement",
  label: "System form",
  helpText: "",
  required: false,
  options: [],
  title: "High-fidelity system form",
  text: "This template uses a dedicated Site-Bolt form UI. Workers complete it from Forms on the Worker Dashboard.",
};

function systemTemplateInput(
  title: string,
  description: string
): CustomFormTemplateInput {
  return {
    title,
    description,
    applies_to_projects: true,
    applies_to_workers: true,
    applies_to_plant: false,
    applies_to_fleet: false,
    applies_to_assets: false,
    assignee_role: "all",
    is_active: true,
    fields: [SYSTEM_STATEMENT_FIELD],
  };
}

export function normalizeFormTitle(title: string | null | undefined): string {
  return String(title ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveHighFidelityFormKey(
  title: string | null | undefined
): HighFidelityFormKey | null {
  const normalized = normalizeFormTitle(title);
  if (
    normalized === "risk assessment" ||
    normalized.includes("risk assessment")
  ) {
    return HIGH_FIDELITY_FORM_KEYS.riskAssessment;
  }
  if (
    normalized === "confined space entry permit" ||
    normalized.includes("confined space")
  ) {
    return HIGH_FIDELITY_FORM_KEYS.confinedSpace;
  }
  return null;
}

export function isHighFidelityFormTemplate(
  template: Pick<CustomFormTemplate, "title"> | string
): boolean {
  const title = typeof template === "string" ? template : template.title;
  return resolveHighFidelityFormKey(title) != null;
}

export function packHighFidelityAnswers(input: {
  summaryLines: Array<{ id: string; label: string; value: string }>;
  payload: unknown;
}): CustomFormAnswers {
  const answers: CustomFormAnswers = {};
  for (const line of input.summaryLines) {
    const value = String(line.value ?? "").trim();
    if (!value) continue;
    answers[line.id] = {
      label: line.label,
      type: "text",
      value,
    };
  }
  answers.form_payload = {
    label: "Full Form Payload",
    type: "textarea",
    value: JSON.stringify(input.payload ?? {}, null, 2),
  };
  return answers;
}

/**
 * Ensure the two system templates exist and are active in custom_form_templates.
 * Safe to call repeatedly from admin/worker form screens.
 */
export async function ensureHighFidelityFormTemplates(): Promise<{
  templates: CustomFormTemplate[];
  error: string | null;
}> {
  const existing = await fetchCustomFormTemplates();
  if (existing.error) {
    return { templates: [], error: existing.error };
  }

  const byKey = new Map<HighFidelityFormKey, CustomFormTemplate>();
  for (const template of existing.data) {
    const key = resolveHighFidelityFormKey(template.title);
    if (key && !byKey.has(key)) byKey.set(key, template);
  }

  const required: Array<{
    key: HighFidelityFormKey;
    title: string;
    description: string;
  }> = [
    {
      key: HIGH_FIDELITY_FORM_KEYS.riskAssessment,
      title: HIGH_FIDELITY_FORM_TITLES.riskAssessment,
      description:
        "System template — 5×5 risk matrix, hazard identification, and PPE checklist.",
    },
    {
      key: HIGH_FIDELITY_FORM_KEYS.confinedSpace,
      title: HIGH_FIDELITY_FORM_TITLES.confinedSpace,
      description:
        "System template — atmospheric testing, isolations, and entry sign-on/off register.",
    },
  ];

  const created: CustomFormTemplate[] = [];
  for (const item of required) {
    const found = byKey.get(item.key);
    if (found) {
      if (!found.is_active) {
        const { data } = await saveCustomFormTemplate(
          {
            title: found.title,
            description: found.description,
            applies_to_projects: found.applies_to_projects || true,
            applies_to_workers: found.applies_to_workers || true,
            applies_to_plant: found.applies_to_plant,
            applies_to_fleet: found.applies_to_fleet,
            applies_to_assets: found.applies_to_assets,
            assignee_role: found.assignee_role,
            is_active: true,
            fields: found.fields.length ? found.fields : [SYSTEM_STATEMENT_FIELD],
          },
          found.id
        );
        if (data) created.push(data);
      }
      continue;
    }

    const { data, error } = await saveCustomFormTemplate(
      systemTemplateInput(item.title, item.description)
    );
    if (error) {
      return { templates: existing.data, error };
    }
    if (data) created.push(data);
  }

  if (created.length === 0) {
    return { templates: existing.data, error: null };
  }

  const refreshed = await fetchCustomFormTemplates();
  return { templates: refreshed.data, error: refreshed.error };
}
