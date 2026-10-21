import { buildWorkerFullName } from "./worker-utils";

export interface SubcontractorPortalWorker {
  id: string;
  name: string;
  trade: string;
  email: string;
  phone: string;
  competency_status: string;
}

export interface SubcontractorPortalPlant {
  id: string;
  make: string;
  model: string;
  serial_number: string;
  next_service_date: string;
}

function text(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const next = text(value);
    if (next) return next;
  }
  return "";
}

export function mapSubcontractorPortalWorkerRow(
  row: Record<string, unknown>
): SubcontractorPortalWorker {
  const firstName = text(row.first_name);
  const lastName = text(row.last_name);
  const name =
    firstText(row.full_name, row.worker_name) ||
    (firstName || lastName ? buildWorkerFullName(firstName, lastName) : "") ||
    text(row.email) ||
    "Worker";
  const hasWhiteCard = Boolean(
    text(row.white_card_doc_url) || text(row.white_card_photo_url)
  );
  const hasSilica = Boolean(
    text(row.silica_cert_doc_url) || text(row.silica_cert_photo_url)
  );

  return {
    id: text(row.id),
    name,
    trade: firstText(row.trade, row.worker_type, row.role) || "—",
    email: text(row.email) || "—",
    phone: text(row.phone) || "—",
    competency_status:
      hasWhiteCard && hasSilica ? "Documents on file" : "Missing Documents",
  };
}

export function mapSubcontractorPortalPlantRow(
  row: Record<string, unknown>
): SubcontractorPortalPlant {
  return {
    id: text(row.id),
    make: text(row.make) || "—",
    model: text(row.model) || "—",
    serial_number:
      firstText(
        row.serial_number,
        row.vin,
        row.registration_code,
        row.rego,
        row.registration
      ) || "—",
    next_service_date:
      firstText(
        row.next_service_date,
        row.service_expiry,
        row.next_service_due,
        row.next_service_due_date
      ) || "—",
  };
}
