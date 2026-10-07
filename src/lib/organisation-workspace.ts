import {
  A_PLUS_ORGANISATION_ID,
  A_PLUS_ORGANISATION_NAME,
  DEMO_ORGANISATION_ID,
  DEMO_ORGANISATION_NAME,
} from "@/lib/active-organisation";
import { WORKER_STATE_REGION_OPTIONS } from "@/lib/worker-state-region";

export const COMPANY_MODULE_OPTIONS = [
  { id: "plant_qr", label: "Plant QR" },
  { id: "swms", label: "31-Day SWMS" },
  { id: "timesheets", label: "Timesheets/MYOB" },
  { id: "itp_itc", label: "ITP/ITC" },
] as const;

export const COMPANY_STATE_OPTIONS = WORKER_STATE_REGION_OPTIONS;

export interface WorkspaceCompany {
  id: string;
  company_name: string;
  is_demo: boolean;
  state?: string | null;
}

export const KNOWN_WORKSPACE_COMPANIES: WorkspaceCompany[] = [
  {
    id: A_PLUS_ORGANISATION_ID,
    company_name: A_PLUS_ORGANISATION_NAME,
    is_demo: false,
  },
  {
    id: DEMO_ORGANISATION_ID,
    company_name: DEMO_ORGANISATION_NAME,
    is_demo: true,
  },
];

export function shortCompanyLabel(company: Pick<WorkspaceCompany, "company_name" | "is_demo">): string {
  if (company.is_demo) return "SiteBolt Demo";
  const name = company.company_name.trim();
  if (name.toLowerCase().includes("a plus plumbing")) return "A Plus Plumbing (ACT) PTY LTD";
  return name;
}

export function mergeWorkspaceCompanies(rows: WorkspaceCompany[]): WorkspaceCompany[] {
  const byId = new Map<string, WorkspaceCompany>();
  for (const known of KNOWN_WORKSPACE_COMPANIES) {
    byId.set(known.id, known);
  }
  for (const row of rows) {
    const existing = byId.get(row.id);
    byId.set(row.id, {
      id: row.id,
      company_name: row.company_name.trim() || existing?.company_name || "Company",
      is_demo: row.is_demo || existing?.is_demo || row.id === DEMO_ORGANISATION_ID,
      state: row.state ?? existing?.state ?? null,
    });
  }
  return [...byId.values()].sort((a, b) => {
    if (a.id === A_PLUS_ORGANISATION_ID) return -1;
    if (b.id === A_PLUS_ORGANISATION_ID) return 1;
    if (a.id === DEMO_ORGANISATION_ID) return -1;
    if (b.id === DEMO_ORGANISATION_ID) return 1;
    return a.company_name.localeCompare(b.company_name);
  });
}
