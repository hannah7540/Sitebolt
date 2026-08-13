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
  /** Shown above the signature canvas so workers know what they are agreeing to. */
  compliance_text: string;
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
    step_key: "excavation",
    step_index: 0,
    title: "Excavation & Trench",
    description: "Verify depth, width, and bedding preparation.",
    compliance_text:
      "I confirm excavation depth, trench width, and bedding preparation meet the approved drawings, specification, and ITC requirements for this run.",
    field_spec: { type: "checklist" },
  },
  {
    step_key: "survey_setout",
    step_index: 1,
    title: "Survey Set-Out / As-Built",
    description: "Record rover and operator for set-out or as-built.",
    compliance_text:
      "I confirm survey set-out / as-built data was captured with the nominated rover and operator, and matches the approved design for this ITC location.",
    field_spec: { type: "survey", fields: ["rover_id", "operator_name"] },
  },
  {
    step_key: "service_install",
    step_index: 2,
    title: "Service Installation",
    description: "Confirm conduit configuration and installation quality.",
    compliance_text:
      "I confirm services were installed per the approved conduit configuration, bedding, haunching, and cover requirements for this ITC.",
    field_spec: { type: "checklist" },
  },
  {
    step_key: "compaction_test",
    step_index: 3,
    title: "Compaction Tests",
    description: "Link compaction test number and company/tech signature.",
    compliance_text:
      "I confirm compaction testing was completed by the nominated company/technician and the recorded test number is linked to this ITC location.",
    field_spec: {
      type: "compaction",
      fields: ["test_number", "company_name", "technician_name"],
    },
  },
  {
    step_key: "cctv",
    step_index: 4,
    title: "CCTV Inspection",
    description: "Record pass/fail and return requirements.",
    compliance_text:
      "I confirm the CCTV inspection outcome recorded here is accurate and any return-to-site requirements have been noted.",
    field_spec: {
      type: "cctv",
      fields: ["outcome", "return_required"],
      outcomes: ["Pass", "Fail"],
      return_options: ["Return Required", "Not Required"],
    },
  },
  {
    step_key: "reinstatement",
    step_index: 5,
    title: "Reinstatement",
    description: "Confirm surface reinstatement and cleanup.",
    compliance_text:
      "I confirm surface reinstatement and site cleanup meet project requirements and the work area is left in a safe, tidy condition.",
    field_spec: { type: "checklist" },
  },
  {
    step_key: "final_signoff",
    step_index: 6,
    title: "Final Sign-Off",
    description: "Leading hand / supervisor final verification.",
    compliance_text:
      "I confirm all prior ITC quality steps for this run are complete and this installation is ready for final verification and close-out.",
    field_spec: { type: "checklist" },
  },
];

/** True when the worker may edit/submit this step (step 0 always; later steps need prior step submitted). */
export function isItcStepUnlocked(
  stepIndex: number,
  signoffs: { step_index: number; author_id: string; status: string }[],
  authorId: string
): boolean {
  if (stepIndex <= 0) return true;
  return signoffs.some(
    (row) =>
      row.step_index === stepIndex - 1 &&
      row.author_id === authorId &&
      row.status === "submitted"
  );
}

/** Highest step index the worker has submitted (or -1 if none). */
export function highestSubmittedStepIndex(
  signoffs: { step_index: number; author_id: string; status: string }[],
  authorId: string
): number {
  return signoffs
    .filter((row) => row.author_id === authorId && row.status === "submitted")
    .reduce((max, row) => Math.max(max, row.step_index), -1);
}

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
