export type ItcStatus = "not_started" | "ongoing" | "issue" | "complete";

export type ItcSignoffStatus = "draft" | "submitted";

export type ItcChangeRequestStatus = "pending" | "approved" | "rejected";

export interface ItcConduitConfig {
  n: number;
  size: string;
}

export interface ItcPhotoSlot {
  key: string;
  label: string;
}

export interface ItcFormStepTemplate {
  step_key: string;
  step_index: number;
  title: string;
  description?: string;
  field_spec: Record<string, unknown>;
}

export const ITC_STATUS_LABELS: Record<ItcStatus, string> = {
  not_started: "Not Started",
  ongoing: "Ongoing",
  issue: "Issue / CR",
  complete: "Complete",
};

export const ITC_STATUS_COLORS: Record<
  ItcStatus,
  { bg: string; text: string; pin: string }
> = {
  not_started: { bg: "bg-slate-100", text: "text-slate-700", pin: "bg-slate-400" },
  ongoing: { bg: "bg-amber-100", text: "text-amber-800", pin: "bg-amber-400" },
  issue: { bg: "bg-red-100", text: "text-red-800", pin: "bg-red-500" },
  complete: { bg: "bg-emerald-100", text: "text-emerald-800", pin: "bg-emerald-500" },
};

export const ITC_PHOTO_SLOTS: ItcPhotoSlot[] = [
  { key: "trench_bottom", label: "Trench Bottom" },
  { key: "bedding", label: "Bedding" },
  { key: "service_installed", label: "Service Installed" },
  { key: "haunching", label: "Haunching" },
  { key: "cover", label: "Cover" },
  { key: "warning_tape", label: "Warning Tape" },
  { key: "backfill", label: "Backfill" },
  { key: "compaction", label: "Compaction" },
  { key: "reinstatement", label: "Reinstatement" },
];

export const DEFAULT_ITC_FORM_STEPS: ItcFormStepTemplate[] = [
  {
    step_key: "pre_start",
    step_index: 0,
    title: "Pre-Start / Safety",
    description: "Confirm SWMS, permits, and trench safety controls.",
    field_spec: { type: "checklist" },
  },
  {
    step_key: "excavation",
    step_index: 1,
    title: "Excavation & Trench",
    description: "Verify depth, width, and bedding preparation.",
    field_spec: { type: "checklist" },
  },
  {
    step_key: "survey_setout",
    step_index: 2,
    title: "Survey Set-Out / As-Built",
    description: "Record rover and operator for set-out or as-built.",
    field_spec: { type: "survey", fields: ["rover_id", "operator_name"] },
  },
  {
    step_key: "service_install",
    step_index: 3,
    title: "Service Installation",
    description: "Confirm conduit configuration and installation quality.",
    field_spec: { type: "checklist" },
  },
  {
    step_key: "compaction_test",
    step_index: 4,
    title: "Compaction Tests",
    description: "Link compaction test number and company/tech signature.",
    field_spec: {
      type: "compaction",
      fields: ["test_number", "company_name", "technician_name"],
    },
  },
  {
    step_key: "cctv",
    step_index: 5,
    title: "CCTV Inspection",
    description: "Record pass/fail and return requirements.",
    field_spec: {
      type: "cctv",
      fields: ["outcome", "return_required"],
      outcomes: ["Pass", "Fail"],
      return_options: ["Return Required", "Not Required"],
    },
  },
  {
    step_key: "reinstatement",
    step_index: 6,
    title: "Reinstatement",
    description: "Confirm surface reinstatement and cleanup.",
    field_spec: { type: "checklist" },
  },
  {
    step_key: "final_signoff",
    step_index: 7,
    title: "Final Sign-Off",
    description: "Leading hand / supervisor final verification.",
    field_spec: { type: "checklist" },
  },
];

export const DEMO_ITC_ZONES = [
  { zone_code: "MP0", zone_name: "MP0", map_x: 0.18, map_y: 0.32, sort_order: 1 },
  { zone_code: "MP1", zone_name: "MP1", map_x: 0.42, map_y: 0.28, sort_order: 2 },
  {
    zone_code: "HRN",
    zone_name: "Haul Road North",
    map_x: 0.68,
    map_y: 0.45,
    sort_order: 3,
  },
  { zone_code: "SUB-A", zone_name: "Substation A", map_x: 0.55, map_y: 0.62, sort_order: 4 },
];

export function formatConduitConfig(conduits: ItcConduitConfig[]): string {
  if (!conduits.length) return "—";
  return conduits.map((row) => `${row.n}×${row.size}`).join(", ");
}

export function computeItcProgress(
  submittedSteps: number,
  totalSteps: number
): number {
  if (totalSteps <= 0) return 0;
  return Math.round((submittedSteps / totalSteps) * 100);
}

export function deriveItcStatus(input: {
  progress_percent: number;
  has_open_cr: boolean;
  submittedSteps: number;
}): ItcStatus {
  if (input.has_open_cr) return "issue";
  if (input.progress_percent >= 100 || input.submittedSteps >= DEFAULT_ITC_FORM_STEPS.length) {
    return "complete";
  }
  if (input.submittedSteps > 0 || input.progress_percent > 0) return "ongoing";
  return "not_started";
}
