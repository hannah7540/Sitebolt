import type { Worker, WorkerVoc } from "./supabase";
import {
  hydrateCardsVocsFromWorker,
  type WorkerCardVocEntry,
} from "./worker-cards-vocs";
import { getWorkerDisplayName, getTicketStatus, type TicketStatus } from "./worker-utils";
import { VOC_TYPE_OPTIONS } from "./voc-utils";

/** Standard compliance cards plus all plant VOC types. */
export const COMPETENCY_COLUMN_LABELS = [
  "Driver's Licence",
  "White Card",
  "Silica Awareness",
  ...VOC_TYPE_OPTIONS,
] as const;

export type CompetencyColumnLabel = (typeof COMPETENCY_COLUMN_LABELS)[number];

export type CompetencyCellStatus =
  | "missing"
  | "valid"
  | "expires_soon"
  | "expired"
  | "no_expiry";

export interface CompetencyCell {
  status: CompetencyCellStatus;
  display: string;
}

export interface CompetencyMatrixRow {
  workerId: string;
  workerName: string;
  role: string;
  cells: Record<CompetencyColumnLabel, CompetencyCell>;
}

function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[''´`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatExpiryDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function entryHasCompetency(entry: WorkerCardVocEntry): boolean {
  return Boolean(
    entry.ticket_number ||
      entry.issue_date ||
      entry.expiry_date ||
      entry.document_url ||
      entry.voc_type ||
      entry.ticket_name
  );
}

function entryLabel(entry: WorkerCardVocEntry): string {
  return normalizeLabel(entry.voc_type || entry.ticket_name || "");
}

function matchesDriversLicence(entry: WorkerCardVocEntry): boolean {
  const label = entryLabel(entry);
  return (
    (label.includes("driver") &&
      (label.includes("licence") || label.includes("license"))) ||
    label.includes("drivers licence")
  );
}

function matchesColumn(
  column: CompetencyColumnLabel,
  entry: WorkerCardVocEntry
): boolean {
  if (!entryHasCompetency(entry)) return false;

  switch (column) {
    case "Driver's Licence":
      return entry.category === "hrwl" && matchesDriversLicence(entry);
    case "White Card":
      return (
        entry.category === "white_card" ||
        entryLabel(entry) === normalizeLabel("White Card")
      );
    case "Silica Awareness":
      return entryLabel(entry) === normalizeLabel("Silica Awareness");
    default:
      return entryLabel(entry) === normalizeLabel(column);
  }
}

function ticketStatusToCellStatus(status: TicketStatus): CompetencyCellStatus {
  switch (status) {
    case "valid":
      return "valid";
    case "expires_soon":
      return "expires_soon";
    case "expired":
      return "expired";
    default:
      return "no_expiry";
  }
}

function pickBestEntry(entries: WorkerCardVocEntry[]): WorkerCardVocEntry | null {
  if (entries.length === 0) return null;

  const withExpiry = entries.filter((entry) => entry.expiry_date);
  if (withExpiry.length > 0) {
    return withExpiry.sort(
      (left, right) =>
        new Date(right.expiry_date!).getTime() -
        new Date(left.expiry_date!).getTime()
    )[0];
  }

  return entries[0];
}

export function resolveCompetencyCell(
  entry: WorkerCardVocEntry | null
): CompetencyCell {
  if (!entry || !entryHasCompetency(entry)) {
    return { status: "missing", display: "-" };
  }

  if (!entry.expiry_date) {
    return { status: "no_expiry", display: "Yes" };
  }

  const ticketStatus = getTicketStatus(entry.expiry_date);
  return {
    status: ticketStatusToCellStatus(ticketStatus),
    display: `Yes (Exp: ${formatExpiryDate(entry.expiry_date)})`,
  };
}

export function buildWorkerCompetencyRow(
  worker: Worker,
  vocs: WorkerVoc[] = []
): CompetencyMatrixRow {
  const entries = hydrateCardsVocsFromWorker(worker, vocs);
  const cells = {} as Record<CompetencyColumnLabel, CompetencyCell>;

  for (const column of COMPETENCY_COLUMN_LABELS) {
    const matching = entries.filter((entry) => matchesColumn(column, entry));
    cells[column] = resolveCompetencyCell(pickBestEntry(matching));
  }

  return {
    workerId: worker.id,
    workerName: getWorkerDisplayName(worker),
    role: worker.trade?.trim() || worker.worker_type?.trim() || "",
    cells,
  };
}

export function isActiveMatrixWorker(worker: Worker): boolean {
  if (worker.is_revoked || worker.is_archived) return false;
  const status = String(worker.status ?? "").toLowerCase();
  return status !== "revoked";
}

export function buildCompetencyMatrix(
  workers: Worker[],
  vocs: WorkerVoc[]
): CompetencyMatrixRow[] {
  const vocsByWorker = new Map<string, WorkerVoc[]>();
  for (const voc of vocs) {
    const bucket = vocsByWorker.get(voc.worker_id) ?? [];
    bucket.push(voc);
    vocsByWorker.set(voc.worker_id, bucket);
  }

  return workers
    .filter(isActiveMatrixWorker)
    .map((worker) =>
      buildWorkerCompetencyRow(worker, vocsByWorker.get(worker.id) ?? [])
    )
    .sort((left, right) =>
      left.workerName.localeCompare(right.workerName, undefined, {
        sensitivity: "base",
      })
    );
}

export function filterCompetencyMatrixRows(
  rows: CompetencyMatrixRow[],
  query: string
): CompetencyMatrixRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;

  return rows.filter((row) => {
    const haystack = `${row.workerName} ${row.role}`.toLowerCase();
    return haystack.includes(needle);
  });
}

function escapeCsvValue(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildCompetencyMatrixCsv(rows: CompetencyMatrixRow[]): string {
  const headers = ["Worker Name", "Role", ...COMPETENCY_COLUMN_LABELS];
  const lines = rows.map((row) =>
    [
      row.workerName,
      row.role,
      ...COMPETENCY_COLUMN_LABELS.map((column) => row.cells[column].display),
    ]
      .map(escapeCsvValue)
      .join(",")
  );

  return [headers.map(escapeCsvValue).join(","), ...lines].join("\n");
}

export function downloadCompetencyMatrixCsv(
  rows: CompetencyMatrixRow[],
  filename = "sitebolt-competency-matrix.csv"
): void {
  const csv = buildCompetencyMatrixCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function competencyCellClassName(status: CompetencyCellStatus): string {
  switch (status) {
    case "valid":
    case "no_expiry":
      return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200";
    case "expires_soon":
      return "bg-amber-50 text-amber-900 ring-1 ring-amber-200";
    case "expired":
      return "bg-red-50 text-red-800 ring-1 ring-red-200";
    default:
      return "text-slate-300";
  }
}
