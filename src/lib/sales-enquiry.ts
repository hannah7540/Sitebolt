import { isWorkerStateRegion, WORKER_STATE_REGION_OPTIONS } from "@/lib/worker-state-region";

export const SALES_ENQUIRIES_TABLE = "sales_enquiries";

export const SALES_ENQUIRY_STATE_OPTIONS = WORKER_STATE_REGION_OPTIONS;

/** Public custom-build inquiry only — does not change internal project/worker states. */
export const CUSTOM_BUILD_STATE_OPTIONS = [
  { id: "ACT", label: "ACT (Australian Capital Territory)" },
  { id: "NSW", label: "NSW (New South Wales)" },
  { id: "NT", label: "NT (Northern Territory)" },
  { id: "QLD", label: "QLD (Queensland)" },
  { id: "SA", label: "SA (South Australia)" },
  { id: "TAS", label: "TAS (Tasmania)" },
  { id: "VIC", label: "VIC (Victoria)" },
  { id: "WA", label: "WA (Western Australia)" },
  { id: "NZ", label: "NZ (New Zealand)" },
] as const;

export type CustomBuildStateId = (typeof CUSTOM_BUILD_STATE_OPTIONS)[number]["id"];

export function isCustomBuildStateRegion(
  value: string | null | undefined
): value is CustomBuildStateId {
  if (!value) return false;
  return CUSTOM_BUILD_STATE_OPTIONS.some((item) => item.id === value);
}

export const SALES_ENQUIRY_TEAM_SIZES = ["1-10", "11-30", "31-50", "50+"] as const;

export const SALES_ENQUIRY_MODULES = [
  { id: "plant_qr", label: "Plant QR" },
  { id: "swms", label: "SWMS" },
  { id: "timesheets", label: "Timesheets" },
  { id: "itp_itc", label: "ITP/ITC" },
] as const;

export type SalesEnquiryTeamSize = (typeof SALES_ENQUIRY_TEAM_SIZES)[number];
export type SalesEnquiryModuleId = (typeof SALES_ENQUIRY_MODULES)[number]["id"];

export const CUSTOM_BUILD_MODULE_ID = "custom_build";

export type SalesEnquiryType = "general" | "custom_build";

export interface SalesEnquiryInput {
  fullName: string;
  companyName: string;
  workEmail: string;
  phone?: string;
  state: string;
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
    state: string;
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

export function validateSalesEnquiry(input: unknown): SalesEnquiryValidation {
  const record = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const fullName = readTrimmed(record.fullName ?? record.full_name);
  const companyName = readTrimmed(record.companyName ?? record.company_name);
  const workEmail = readTrimmed(record.workEmail ?? record.work_email).toLowerCase();
  const phone = readTrimmed(record.phone);
  const state = readTrimmed(record.state).toUpperCase();
  const teamSize = readTrimmed(record.teamSize ?? record.fleet_team_size);
  const notes = readTrimmed(record.notes ?? record.brief ?? record.custom_brief);
  const enquiryTypeRaw = readTrimmed(record.enquiryType ?? record.enquiry_type).toLowerCase();
  const enquiryType: SalesEnquiryType =
    enquiryTypeRaw === "custom_build" ? "custom_build" : "general";
  const rawModules = record.modules ?? record.modules_of_interest;
  const modules = Array.isArray(rawModules)
    ? rawModules.map((value) => String(value).trim()).filter(Boolean)
    : [];

  const errors: Record<string, string> = {};
  if (!fullName) errors.fullName = "Full name is required.";
  if (!companyName) errors.companyName = "Company name is required.";
  if (!workEmail) errors.workEmail = "Work email is required.";
  else if (!EMAIL_RE.test(workEmail)) errors.workEmail = "Enter a valid work email.";
  if (enquiryType === "custom_build") {
    if (!isCustomBuildStateRegion(state)) {
      errors.state = "Select a state or region.";
    }
  } else if (!isWorkerStateRegion(state)) {
    errors.state = "Select ACT, NSW, WA, or NZ.";
  }
  if (enquiryType === "custom_build" && !phone) {
    errors.phone = "Phone number is required.";
  }
  if (enquiryType === "custom_build" && notes.length < 12) {
    errors.notes = "Tell us what you want the software to do.";
  }
  if (teamSize && !(SALES_ENQUIRY_TEAM_SIZES as readonly string[]).includes(teamSize)) {
    errors.teamSize = "Select a valid fleet / team size.";
  }

  const allowedModules = new Set<string>([
    ...SALES_ENQUIRY_MODULES.map((item) => item.id),
    CUSTOM_BUILD_MODULE_ID,
  ]);
  const cleanModules = modules.filter((item) => allowedModules.has(item));
  if (enquiryType === "custom_build" && !cleanModules.includes(CUSTOM_BUILD_MODULE_ID)) {
    cleanModules.push(CUSTOM_BUILD_MODULE_ID);
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
      state,
      fleet_team_size: teamSize || null,
      modules_of_interest: cleanModules,
      notes: notes || null,
      enquiry_type: enquiryType,
    },
  };
}
