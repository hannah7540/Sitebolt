import {
  fetchAllWorkerVocs,
  fetchSwmsAssignmentRecordsForWorker,
  fetchSwmsDocumentRecords,
  fetchWorkerById,
  fetchWorkerVocs,
  isSupabaseConfigured,
  type Worker,
  type WorkerVoc,
} from "./supabase";
import { fetchAllInductionAssignments } from "./admin-reporting";
import { isCompletedAssignmentStatus } from "./induction-form-builder";
import { fetchLeaveRequestsNormalized, getLeaveEndDate, getLeaveStartDate } from "./leave-requests";
import { formatLeaveDateRange } from "./leave-utils";
import { normalizeLeaveTypeLabel } from "./leave-type-calendar";
import {
  formatWorkerBsb,
  getWorkerDisplayName,
  maskWorkerAccountNumber,
  maskWorkerTaxFileNumber,
} from "./worker-utils";
import { generateReportPdfFromCsv, downloadReportBlob } from "./pdf/report-pdf";
import { localIsoDate } from "./timesheet-utils";

function escapeCsvValue(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function sectionCsv(title: string, headers: string[], rows: string[][]): string {
  const headerLine = headers.map(escapeCsvValue).join(",");
  const body = rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
  return [`### ${title}`, headerLine, body].filter(Boolean).join("\n");
}

function maskTrailing(value: string | null | undefined, visible = 4): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.length <= visible) return "•".repeat(raw.length);
  return `${"•".repeat(raw.length - visible)}${raw.slice(-visible)}`;
}

function maskBsb(value: string | null | undefined): string {
  const formatted = formatWorkerBsb(value);
  if (!formatted) return "";
  const digits = formatted.replace(/\D/g, "");
  if (digits.length === 6) return `•••-${digits.slice(3)}`;
  return maskTrailing(formatted, 3);
}

function formatStamp(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function sanitizeFileNamePart(value: string): string {
  return value.replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "") || "Worker";
}

export function workerArchiveFileName(
  workerName: string,
  extension: "csv" | "pdf"
): string {
  const name = sanitizeFileNamePart(workerName);
  return `Worker_Archive_${name}_${localIsoDate()}.${extension}`;
}

function formatLeaveStatus(status: string | null | undefined): string {
  const raw = String(status ?? "pending").toLowerCase();
  if (raw === "approved") return "Approved";
  if (raw === "declined" || raw === "rejected") return "Rejected";
  return "Pending";
}

function formatLeaveTotals(days: number | null | undefined): string {
  if (days == null || Number.isNaN(Number(days))) return "";
  const value = Number(days);
  const hours = value * 8;
  const dayLabel = `${value} day${value === 1 ? "" : "s"}`;
  return `${dayLabel} / ${hours} hrs`;
}

export async function buildWorkerArchiveCsv(workerId: string): Promise<{
  worker: Worker | null;
  csvContent: string;
  fileName: string;
  error: string | null;
}> {
  if (!isSupabaseConfigured()) {
    return {
      worker: null,
      csvContent: "",
      fileName: "",
      error: "Supabase is not configured.",
    };
  }

  const worker = await fetchWorkerById(workerId);
  if (!worker) {
    return {
      worker: null,
      csvContent: "",
      fileName: "",
      error: "Worker not found.",
    };
  }

  let vocs: WorkerVoc[] = [];
  try {
    vocs = await fetchWorkerVocs(worker.id);
  } catch {
    const all = await fetchAllWorkerVocs();
    vocs = all.filter((row) => row.worker_id === worker.id);
  }

  const [swmsAssignments, swmsDocs, inductions, leaveRequests] = await Promise.all([
    fetchSwmsAssignmentRecordsForWorker(worker.id),
    fetchSwmsDocumentRecords(),
    fetchAllInductionAssignments(),
    fetchLeaveRequestsNormalized({ workerId: worker.id }),
  ]);

  const swmsById = new Map(swmsDocs.map((doc) => [doc.id, doc]));
  const signedSwms = swmsAssignments.filter(
    (row) => String(row.status).toLowerCase() === "signed" || Boolean(row.signed_at)
  );
  const completedInductions = inductions.filter(
    (row) =>
      row.worker_id === worker.id &&
      (isCompletedAssignmentStatus(row.status) || Boolean(row.completed_at))
  );

  const address = [
    worker.address_line_1,
    worker.address_line_2,
    worker.suburb,
    worker.postcode,
  ]
    .filter(Boolean)
    .join(", ");

  const profileRows: string[][] = [
    ["Full name", getWorkerDisplayName(worker)],
    ["Email", worker.email],
    ["Phone", worker.phone ?? ""],
    ["Date of birth", worker.dob ?? ""],
    ["Address", address],
    ["Emergency contact", worker.emergency_contact_name ?? worker.emergency_contact ?? ""],
    ["Emergency relationship", worker.emergency_contact_relationship ?? ""],
    ["Emergency phone", worker.emergency_contact_phone ?? ""],
    ["Trade", worker.trade ?? ""],
    ["State", worker.state ?? ""],
    ["Status", worker.status ?? ""],
    ["Deleted at", worker.deleted_at ?? ""],
    ["White Card", worker.white_card_number ?? ""],
    ["White Card issue date", worker.white_card_issue_date ?? ""],
    ["Silica cert", worker.silica_cert_number ?? ""],
    ["Silica issue date", worker.silica_cert_issue_date ?? ""],
    ["Driver licence", worker.drivers_licence_number ?? ""],
    ["Driver licence class", worker.drivers_licence_class ?? ""],
    ["Driver licence expiry", worker.drivers_licence_expiry ?? ""],
    ["TFN (masked)", maskWorkerTaxFileNumber(worker.tfn) ?? ""],
    ["Bank name", worker.bank_name ?? ""],
    ["BSB (masked)", maskBsb(worker.bank_bsb)],
    ["Account (masked)", maskWorkerAccountNumber(worker.bank_account_number) ?? ""],
    ["Super fund", worker.super_fund ?? ""],
    ["Super member (masked)", maskTrailing(worker.super_member_number, 4)],
    ["Super USI (masked)", maskTrailing(worker.super_usi, 4)],
  ];

  const vocRows = vocs.map((voc) => [
    voc.title,
    voc.voc_type ?? "",
    voc.issuing_org ?? "",
    voc.issue_date ?? "",
    voc.expiry_date ?? "",
  ]);

  const swmsRows = signedSwms.map((assignment) => {
    const doc = swmsById.get(assignment.swms_id);
    return [
      doc?.title ?? assignment.swms_id,
      doc?.version ?? "",
      formatStamp(assignment.signed_at),
    ];
  });

  const inductionRows = completedInductions.map((row) => [
    row.form_title ?? "",
    row.project_name?.trim() || "Company / State",
    formatStamp(row.completed_at),
  ]);

  const leaveRows = leaveRequests.map((row) => {
    const start = getLeaveStartDate(row);
    const end = getLeaveEndDate(row);
    const range = start && end ? formatLeaveDateRange(start, end) : start || end || "";
    const days = row.effective_days_deducted ?? row.number_of_days;
    return [
      normalizeLeaveTypeLabel(row.leave_type),
      range,
      formatLeaveStatus(row.status),
      formatLeaveTotals(days),
    ];
  });

  const csvContent = [
    sectionCsv("Onboarding & Profile", ["Field", "Value"], profileRows),
    sectionCsv(
      "Licences & Tickets",
      ["Title", "Type", "Issuing org", "Issue date", "Expiry"],
      vocRows.length > 0 ? vocRows : [["No additional VOC records", "", "", "", ""]]
    ),
    sectionCsv(
      "SWMS Sign-offs",
      ["SWMS Title / Code", "Revision", "Sign-off Timestamp"],
      swmsRows.length > 0 ? swmsRows : [["No signed SWMS", "", ""]]
    ),
    sectionCsv(
      "Inductions Completed",
      ["Induction Title", "Jurisdiction / Project", "Completion Timestamp"],
      inductionRows.length > 0
        ? inductionRows
        : [["No completed inductions", "", ""]]
    ),
    sectionCsv(
      "Leave History",
      ["Leave Type", "Date Range", "Status", "Total Days / Hours"],
      leaveRows.length > 0 ? leaveRows : [["No leave records", "", "", ""]]
    ),
  ].join("\n\n");

  return {
    worker,
    csvContent,
    fileName: workerArchiveFileName(getWorkerDisplayName(worker), "csv"),
    error: null,
  };
}

export async function downloadWorkerArchiveExtract(
  workerId: string,
  format: "pdf" | "excel",
  actionedByName: string
): Promise<{ error: string | null; fileName?: string }> {
  const built = await buildWorkerArchiveCsv(workerId);
  if (built.error || !built.worker) return { error: built.error ?? "Worker not found." };

  const workerName = getWorkerDisplayName(built.worker);
  const startDate = built.worker.created_at?.slice(0, 10) || localIsoDate();
  const endDate = localIsoDate();

  if (format === "pdf") {
    const pdf = await generateReportPdfFromCsv({
      csvContent: built.csvContent,
      startDate,
      endDate,
      projectNames: ["Worker archive"],
      modules: ["workers"],
      actionedByName,
      reportTitle: `Worker Archive — ${workerName}`,
      fileName: workerArchiveFileName(workerName, "pdf"),
    });
    downloadReportBlob(pdf.fileName, pdf.blob);
    return { error: null, fileName: pdf.fileName };
  }

  const blob = new Blob([built.csvContent], { type: "text/csv;charset=utf-8;" });
  downloadReportBlob(built.fileName, blob);
  return { error: null, fileName: built.fileName };
}
