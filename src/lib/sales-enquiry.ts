import { isWorkerStateRegion, WORKER_STATE_REGION_OPTIONS } from "@/lib/worker-state-region";

export const SALES_ENQUIRIES_TABLE = "sales_enquiries";

export const SALES_ENQUIRY_STATE_OPTIONS = WORKER_STATE_REGION_OPTIONS;

export const SALES_ENQUIRY_TEAM_SIZES = ["1-10", "11-30", "31-50", "50+"] as const;

export const SALES_ENQUIRY_MODULES = [
  { id: "plant_qr", label: "Plant QR" },
  { id: "swms", label: "SWMS" },
  { id: "timesheets", label: "Timesheets" },
  { id: "itp_itc", label: "ITP/ITC" },
] as const;

export type SalesEnquiryTeamSize = (typeof SALES_ENQUIRY_TEAM_SIZES)[number];
export type SalesEnquiryModuleId = (typeof SALES_ENQUIRY_MODULES)[number]["id"];

export interface SalesEnquiryInput {
  fullName: string;
  companyName: string;
  workEmail: string;
  phone?: string;
  state: string;
  teamSize?: string;
  modules: string[];
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
  const rawModules = record.modules ?? record.modules_of_interest;
  const modules = Array.isArray(rawModules)
    ? rawModules.map((value) => String(value).trim()).filter(Boolean)
    : [];

  const errors: Record<string, string> = {};
  if (!fullName) errors.fullName = "Full name is required.";
  if (!companyName) errors.companyName = "Company name is required.";
  if (!workEmail) errors.workEmail = "Work email is required.";
  else if (!EMAIL_RE.test(workEmail)) errors.workEmail = "Enter a valid work email.";
  if (!isWorkerStateRegion(state)) {
    errors.state = "Select ACT, NSW, WA, or NZ.";
  }
  if (teamSize && !(SALES_ENQUIRY_TEAM_SIZES as readonly string[]).includes(teamSize)) {
    errors.teamSize = "Select a valid fleet / team size.";
  }

  const allowedModules = new Set<string>(SALES_ENQUIRY_MODULES.map((item) => item.id));
  const cleanModules = modules.filter((item) => allowedModules.has(item));

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
    },
  };
}
