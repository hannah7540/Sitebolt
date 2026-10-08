export const SALES_ENQUIRIES_TABLE = "sales_enquiries";

export const SALES_ENQUIRY_TEAM_SIZES = ["1-49", "50-99", "100+"] as const;

export const SALES_ENQUIRY_ALL_MODULE_ID = "all";

export const SALES_ENQUIRY_MODULES = [
  { id: "all", label: "All" },
  { id: "projects_operations", label: "Projects & Operations" },
  { id: "plant_assets", label: "Plant & Assets" },
  { id: "safety_swms", label: "Safety & SWMS" },
  { id: "timesheets_pay_rules", label: "Timesheets & Pay Rules" },
  { id: "quality_assurance", label: "Quality Assurance" },
  { id: "administration_compliance", label: "Administration & Compliance" },
] as const;

export type SalesEnquiryTeamSize = (typeof SALES_ENQUIRY_TEAM_SIZES)[number];
export type SalesEnquiryModuleId = (typeof SALES_ENQUIRY_MODULES)[number]["id"];

export const CUSTOM_BUILD_MODULE_ID = "custom_build";

export type SalesEnquiryType = "general" | "custom_build";

const SPECIFIC_MODULE_IDS = SALES_ENQUIRY_MODULES.filter(
  (item) => item.id !== SALES_ENQUIRY_ALL_MODULE_ID
).map((item) => item.id);

export interface SalesEnquiryInput {
  fullName: string;
  companyName: string;
  workEmail: string;
  phone?: string;
  teamSize?: string;
  modules: string[];
  notes?: string;
  enquiryType?: SalesEnquiryType;
}

export interface SalesEnquiryValidation {
  ok: boolean;
  errors: Record<string, string>;
  payload: {
    full_name: string;
    company_name: string;
    work_email: string;
    phone: string | null;
    fleet_team_size: string | null;
    modules_of_interest: string[];
    notes: string | null;
    enquiry_type: SalesEnquiryType;
  } | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

export function formatSalesEnquiryModuleLabels(ids: string[]): string {
  if (ids.includes(SALES_ENQUIRY_ALL_MODULE_ID)) {
    return SALES_ENQUIRY_MODULES.map((item) => item.label).join(", ");
  }

  const labels: string[] = SALES_ENQUIRY_MODULES.filter((item) => ids.includes(item.id)).map(
    (item) => item.label
  );
  if (ids.includes(CUSTOM_BUILD_MODULE_ID)) labels.push("Custom software");
  return labels.join(", ") || "—";
}

export function toggleSalesEnquiryModule(current: string[], id: string): string[] {
  if (id === SALES_ENQUIRY_ALL_MODULE_ID) {
    return current.includes(SALES_ENQUIRY_ALL_MODULE_ID) ? [] : [SALES_ENQUIRY_ALL_MODULE_ID];
  }

  const selected = new Set(
    current.includes(SALES_ENQUIRY_ALL_MODULE_ID) ? SPECIFIC_MODULE_IDS : current
  );

  if (selected.has(id)) selected.delete(id);
  else selected.add(id);

  const next = SPECIFIC_MODULE_IDS.filter((moduleId) => selected.has(moduleId));
  if (next.length === SPECIFIC_MODULE_IDS.length) return [SALES_ENQUIRY_ALL_MODULE_ID];
  return next;
}

function normalizeModules(modules: string[], enquiryType: SalesEnquiryType): string[] {
  const allowed = new Set<string>([
    ...SALES_ENQUIRY_MODULES.map((item) => item.id),
    CUSTOM_BUILD_MODULE_ID,
  ]);
  const clean = modules.filter((item) => allowed.has(item));
  if (enquiryType === "custom_build" && !clean.includes(CUSTOM_BUILD_MODULE_ID)) {
    clean.push(CUSTOM_BUILD_MODULE_ID);
  }
  if (clean.includes(SALES_ENQUIRY_ALL_MODULE_ID)) {
    return enquiryType === "custom_build"
      ? [SALES_ENQUIRY_ALL_MODULE_ID, CUSTOM_BUILD_MODULE_ID]
      : [SALES_ENQUIRY_ALL_MODULE_ID];
  }
  return clean;
}

export function validateSalesEnquiry(input: unknown): SalesEnquiryValidation {
  const record = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const fullName = readTrimmed(record.fullName ?? record.full_name);
  const companyName = readTrimmed(record.companyName ?? record.company_name);
  const workEmail = readTrimmed(
    record.workEmail ?? record.work_email ?? record.email
  ).toLowerCase();
  const phone = readTrimmed(record.phone ?? record.phoneNumber ?? record.phone_number);
  const teamSize = readTrimmed(
    record.teamSize ??
      record.fleet_team_size ??
      record.employeeCount ??
      record.numberOfEmployees ??
      record.number_of_employees
  );
  const notes = readTrimmed(record.notes ?? record.brief ?? record.custom_brief);
  const enquiryTypeRaw = readTrimmed(record.enquiryType ?? record.enquiry_type).toLowerCase();
  const enquiryType: SalesEnquiryType =
    enquiryTypeRaw === "custom_build" ? "custom_build" : "general";
  const modules = normalizeModules(
    readStringList(
      record.modules ?? record.modules_of_interest ?? record.interestedModules ?? record.interested_modules
    ),
    enquiryType
  );

  const errors: Record<string, string> = {};
  if (!fullName) errors.fullName = "Full name is required.";
  if (!companyName) errors.companyName = "Company name is required.";
  if (!workEmail) errors.workEmail = "Email address is required.";
  else if (!EMAIL_RE.test(workEmail)) errors.workEmail = "Enter a valid email address.";
  if (!phone) errors.phone = "Phone number is required.";
  if (enquiryType === "custom_build" && notes.length < 12) {
    errors.notes = "Tell us what you want the software to do.";
  }
  if (enquiryType === "general" && !teamSize) {
    errors.teamSize = "Select the number of employees.";
  }
  if (teamSize && !(SALES_ENQUIRY_TEAM_SIZES as readonly string[]).includes(teamSize)) {
    errors.teamSize = "Select a valid number of employees.";
  }
  if (enquiryType === "general" && modules.length === 0) {
    errors.modules = "Select at least one interested module.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, payload: null };
  }

  return {
    ok: true,
    errors: {},
    payload: {
      full_name: fullName,
      company_name: companyName,
      work_email: workEmail,
      phone: phone || null,
      fleet_team_size: teamSize || null,
      modules_of_interest: modules,
      notes: notes || null,
      enquiry_type: enquiryType,
    },
  };
}
