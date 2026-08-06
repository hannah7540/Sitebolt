import type { Worker, WorkerVoc } from "./supabase";
import { getVocDisplayTitle } from "./voc-utils";

export type WorkerCardCategory =
  | "white_card"
  | "hrwl"
  | "plant_voc"
  | "first_aid";

export interface WorkerCardVocEntry {
  id: string;
  category: WorkerCardCategory;
  voc_type: string | null;
  ticket_name: string;
  ticket_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  document_url: string | null;
}

export const WORKER_CARD_CATEGORIES: WorkerCardCategory[] = [
  "white_card",
  "hrwl",
  "plant_voc",
  "first_aid",
];

export const WORKER_CARD_CATEGORY_LABELS: Record<WorkerCardCategory, string> = {
  white_card: "White Card",
  hrwl: "High Risk Work Licences (HRWL)",
  plant_voc: "Plant Operations VOCs",
  first_aid: "First Aid",
};

export const WORKER_CARD_CATEGORY_DEFAULTS: Record<WorkerCardCategory, string> = {
  white_card: "White Card",
  hrwl: "High Risk Work Licence",
  plant_voc: "Plant Operations VOC",
  first_aid: "First Aid Certificate",
};

function normalizeText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function optionalText(value: unknown): string | null {
  const text = normalizeText(value);
  return text || null;
}

function isValidCategory(value: unknown): value is WorkerCardCategory {
  return (
    typeof value === "string" &&
    WORKER_CARD_CATEGORIES.includes(value as WorkerCardCategory)
  );
}

export function createEmptyCardVocEntry(
  category: WorkerCardCategory
): WorkerCardVocEntry {
  return {
    id: crypto.randomUUID(),
    category,
    voc_type: null,
    ticket_name:
      category === "plant_voc" ? "" : WORKER_CARD_CATEGORY_DEFAULTS[category],
    ticket_number: null,
    issue_date: null,
    expiry_date: null,
    document_url: null,
  };
}

export function parseCardsVocs(raw: unknown): WorkerCardVocEntry[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const category = row.category;
      if (!isValidCategory(category)) return null;

      return {
        id: normalizeText(row.id) || crypto.randomUUID(),
        category,
        voc_type: optionalText(row.voc_type),
        ticket_name:
          normalizeText(row.ticket_name) ||
          optionalText(row.voc_type) ||
          WORKER_CARD_CATEGORY_DEFAULTS[category],
        ticket_number: optionalText(row.ticket_number),
        issue_date: optionalText(row.issue_date),
        expiry_date: optionalText(row.expiry_date),
        document_url: optionalText(row.document_url),
      } satisfies WorkerCardVocEntry;
    })
    .filter((entry): entry is WorkerCardVocEntry => entry !== null);
}

export function serializeCardsVocs(entries: WorkerCardVocEntry[]): WorkerCardVocEntry[] {
  return entries
    .filter((entry) => (entry.category as string) !== "site_induction")
    .map((entry) => {
    const vocType = optionalText(entry.voc_type);
    const ticketName = vocType || entry.ticket_name.trim();
    return {
      id: entry.id,
      category: entry.category,
      voc_type: vocType,
      ticket_name: ticketName,
      ticket_number: optionalText(entry.ticket_number),
      issue_date: optionalText(entry.issue_date),
      expiry_date: optionalText(entry.expiry_date),
      document_url: optionalText(entry.document_url),
    };
  });
}

/** Build cards_vocs from legacy worker columns and worker_vocs rows when JSONB is empty. */
export function hydrateCardsVocsFromWorker(
  worker: Worker,
  vocs: WorkerVoc[] = []
): WorkerCardVocEntry[] {
  const parsed = parseCardsVocs(worker.cards_vocs);
  if (parsed.length > 0) return parsed;

  const entries: WorkerCardVocEntry[] = [];

  if (
    worker.white_card_number ||
    worker.white_card_issue_date ||
    worker.white_card_doc_url ||
    worker.white_card_photo_url
  ) {
    entries.push({
      id: crypto.randomUUID(),
      category: "white_card",
      voc_type: null,
      ticket_name: "White Card",
      ticket_number: worker.white_card_number,
      issue_date: worker.white_card_issue_date,
      expiry_date: null,
      document_url: worker.white_card_doc_url ?? worker.white_card_photo_url,
    });
  }

  if (
    worker.drivers_licence_number ||
    worker.drivers_licence_expiry ||
    worker.drivers_licence_photo_url
  ) {
    entries.push({
      id: crypto.randomUUID(),
      category: "hrwl",
      voc_type: null,
      ticket_name: worker.drivers_licence_class
        ? `Driver Licence (${worker.drivers_licence_class})`
        : "Driver Licence / HRWL",
      ticket_number: worker.drivers_licence_number,
      issue_date: null,
      expiry_date: worker.drivers_licence_expiry,
      document_url: worker.drivers_licence_photo_url,
    });
  }

  if (worker.silica_cert_number || worker.silica_cert_issue_date) {
    entries.push({
      id: crypto.randomUUID(),
      category: "hrwl",
      voc_type: null,
      ticket_name: "Silica Awareness",
      ticket_number: worker.silica_cert_number,
      issue_date: worker.silica_cert_issue_date,
      expiry_date: null,
      document_url: worker.silica_cert_doc_url ?? worker.silica_cert_photo_url,
    });
  }

  for (const voc of vocs) {
    const vocType = getVocDisplayTitle(voc);
    entries.push({
      id: voc.id,
      category: "plant_voc",
      voc_type: vocType || null,
      ticket_name: vocType,
      ticket_number: null,
      issue_date: voc.issue_date,
      expiry_date: voc.expiry_date,
      document_url: voc.document_url,
    });
  }

  return entries;
}

export function splitWorkerName(worker: Worker): { firstName: string; lastName: string } {
  const first = worker.first_name?.trim() ?? "";
  const last = worker.last_name?.trim() ?? "";
  if (first || last) return { firstName: first, lastName: last };

  const parts = worker.full_name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}
