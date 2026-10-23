import Papa from "papaparse";
import { normalizeWorkerStateRegion } from "@/lib/worker-state-region";
import { formatWorkerBsb } from "@/lib/worker-utils";

export const BULK_ONBOARDING_CSV_HEADERS = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "dob",
  "address_line_1",
  "address_line_2",
  "suburb",
  "postcode",
  "state",
  "emergency_contact",
  "emergency_contact_name",
  "emergency_contact_relationship",
  "emergency_contact_phone",
  "bank_name",
  "bank_account_name",
  "bank_bsb",
  "bank_account_number",
  "super_fund",
  "super_member_number",
  "tfn",
] as const;

export const BULK_ONBOARDING_COMPLIANCE_KEYS = [
  "white_card_number",
  "white_card_issue_date",
  "silica_cert_number",
  "silica_cert_issue_date",
  "drivers_licence_number",
  "drivers_licence_class",
  "drivers_licence_expiry",
] as const;

export type BulkOnboardingCsvKey = (typeof BULK_ONBOARDING_CSV_HEADERS)[number];
export type BulkOnboardingComplianceKey =
  (typeof BULK_ONBOARDING_COMPLIANCE_KEYS)[number];
export type BulkOnboardingFieldKey =
  | BulkOnboardingCsvKey
  | BulkOnboardingComplianceKey;

export type BulkOnboardingVoc = {
  clientId: string;
  title: string;
  voc_type: string;
  issuing_org: string;
  issue_date: string;
  expiry_date: string;
  document_url: string | null;
};

export type BulkOnboardingWorker = {
  rowIndex: number;
  white_card_photo_url: string;
  white_card_doc_url: string;
  silica_cert_photo_url: string;
  silica_cert_doc_url: string;
  drivers_licence_photo_url: string;
  assigned_project_id: string;
  assigned_project_name: string;
  tag_ids: string[];
  vocs: BulkOnboardingVoc[];
} & Record<BulkOnboardingFieldKey, string>;

export const BULK_TICKET_FIELD_KEYS: readonly BulkOnboardingFieldKey[] = [
  "white_card_number",
  "white_card_issue_date",
  "silica_cert_number",
  "silica_cert_issue_date",
  "drivers_licence_number",
  "drivers_licence_class",
  "drivers_licence_expiry",
];

export function emptyTicketDocuments(): Pick<
  BulkOnboardingWorker,
  | "white_card_photo_url"
  | "white_card_doc_url"
  | "silica_cert_photo_url"
  | "silica_cert_doc_url"
  | "drivers_licence_photo_url"
  | "assigned_project_id"
  | "assigned_project_name"
  | "tag_ids"
  | "vocs"
> {
  return {
    white_card_photo_url: "",
    white_card_doc_url: "",
    silica_cert_photo_url: "",
    silica_cert_doc_url: "",
    drivers_licence_photo_url: "",
    assigned_project_id: "",
    assigned_project_name: "",
    tag_ids: [],
    vocs: [],
  };
}

export function bulkUploadPrefix(worker: BulkOnboardingWorker): string {
  const slug =
    worker.email.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
    `row-${worker.rowIndex}`;
  return `bulk-onboarding/${worker.rowIndex}-${slug}`;
}

export const OPTIONAL_BULK_ONBOARDING_FIELDS: readonly BulkOnboardingFieldKey[] = [
  "address_line_2",
  "drivers_licence_number",
  "drivers_licence_class",
  "drivers_licence_expiry",
];

const SILICA_BULK_FIELDS: readonly BulkOnboardingFieldKey[] = [
  "silica_cert_number",
  "silica_cert_issue_date",
];

export function optionalBulkOnboardingFields(
  silicaOptional = false
): readonly BulkOnboardingFieldKey[] {
  if (!silicaOptional) return OPTIONAL_BULK_ONBOARDING_FIELDS;
  return [...OPTIONAL_BULK_ONBOARDING_FIELDS, ...SILICA_BULK_FIELDS];
}

export const BULK_ONBOARDING_FIELD_LABELS: Record<BulkOnboardingFieldKey, string> = {
  first_name: "First name",
  last_name: "Last name",
  email: "Email",
  phone: "Phone",
  dob: "Date of birth",
  address_line_1: "Address line 1",
  address_line_2: "Address line 2",
  suburb: "Suburb",
  postcode: "Postcode",
  state: "State / region",
  emergency_contact: "Emergency contact",
  emergency_contact_name: "Emergency contact name",
  emergency_contact_relationship: "Emergency contact relationship",
  emergency_contact_phone: "Emergency contact phone",
  bank_name: "Bank name",
  bank_account_name: "Bank account name",
  bank_bsb: "BSB",
  bank_account_number: "Bank account number",
  super_fund: "Super fund",
  super_member_number: "Super member number",
  tfn: "Tax file number",
  white_card_number: "White card number",
  white_card_issue_date: "White card issue date",
  silica_cert_number: "Silica certificate number",
  silica_cert_issue_date: "Silica certificate issue date",
  drivers_licence_number: "Driver's licence number",
  drivers_licence_class: "Driver's licence class",
  drivers_licence_expiry: "Driver's licence expiry",
};

const DATE_FIELDS = new Set<BulkOnboardingFieldKey>([
  "dob",
  "white_card_issue_date",
  "silica_cert_issue_date",
  "drivers_licence_expiry",
]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ALL_WORKER_FIELD_KEYS: readonly BulkOnboardingFieldKey[] = [
  ...BULK_ONBOARDING_CSV_HEADERS,
  ...BULK_ONBOARDING_COMPLIANCE_KEYS,
];

export const defaultWorkerTemplate: Record<BulkOnboardingFieldKey, string> =
  Object.fromEntries(ALL_WORKER_FIELD_KEYS.map((key) => [key, ""])) as Record<
    BulkOnboardingFieldKey,
    string
  >;

/** Strip spaces, underscores, dashes, BOM, and leftover punctuation so "First Name" becomes `firstname`. */
export function sanitizeCsvHeader(header: string): string {
  return String(header ?? "")
    .replace(/[\s_\-\uFEFF]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function trimCell(value: unknown): string {
  if (value == null) return "";
  return String(value).replace(/^\uFEFF/, "").trim();
}

/** Rebuild a PapaParse row so every key is stripped/lowercased (`" First_Name "` → `firstname`). */
export function sanitizeParsedRow(
  row: Record<string, unknown> | null | undefined
): Record<string, string> {
  const clean: Record<string, string> = {};
  if (!row) return clean;

  for (const [key, value] of Object.entries(row)) {
    const sanitized = sanitizeCsvHeader(key);
    if (!sanitized) continue;
    const cell = trimCell(value);
    if (!cell && clean[sanitized]) continue;
    clean[sanitized] = cell;
  }

  return clean;
}

function mapCleanRowToWorker(
  cleanRow: Record<string, string>,
  rowIndex: number
): BulkOnboardingWorker {
  return {
    rowIndex,
    ...defaultWorkerTemplate,
    ...emptyTicketDocuments(),
    first_name: cleanRow.firstname || "",
    last_name: cleanRow.lastname || "",
    email: cleanRow.email || "",
    phone: cleanRow.phone || "",
    dob: parseIsoDate(cleanRow.dob || "") || cleanRow.dob || "",
    address_line_1: cleanRow.addressline1 || "",
    address_line_2: cleanRow.addressline2 || "",
    suburb: cleanRow.suburb || "",
    postcode: cleanRow.postcode || "",
    state: cleanRow.state || "",
    emergency_contact: cleanRow.emergencycontact || "",
    emergency_contact_name: cleanRow.emergencycontactname || "",
    emergency_contact_relationship: cleanRow.emergencycontactrelationship || "",
    emergency_contact_phone: cleanRow.emergencycontactphone || "",
    bank_name: cleanRow.bankname || "",
    bank_account_name: cleanRow.bankaccountname || "",
    bank_bsb: cleanRow.bankbsb || "",
    bank_account_number: cleanRow.bankaccountnumber || "",
    super_fund: cleanRow.superfund || "",
    super_member_number: cleanRow.supermembernumber || "",
    tfn: cleanRow.tfn || "",
    white_card_number: cleanRow.whitecardnumber || "",
    white_card_issue_date:
      parseIsoDate(cleanRow.whitecardissuedate || "") ||
      cleanRow.whitecardissuedate ||
      "",
    silica_cert_number: cleanRow.silicacertnumber || "",
    silica_cert_issue_date:
      parseIsoDate(cleanRow.silicacertissuedate || "") ||
      cleanRow.silicacertissuedate ||
      "",
    drivers_licence_number:
      cleanRow.driverslicencenumber || cleanRow.driverslicensenumber || "",
    drivers_licence_class:
      cleanRow.driverslicenceclass || cleanRow.driverslicenseclass || "",
    drivers_licence_expiry:
      parseIsoDate(
        cleanRow.driverslicenceexpiry || cleanRow.driverslicenseexpiry || ""
      ) ||
      cleanRow.driverslicenceexpiry ||
      cleanRow.driverslicenseexpiry ||
      "",
  };
}

export function buildWizardDraft(
  worker: BulkOnboardingWorker,
  silicaOptional = false
): Partial<Record<BulkOnboardingFieldKey, string>> {
  const draft: Partial<Record<BulkOnboardingFieldKey, string>> = {};
  for (const key of getInvalidBulkOnboardingFields(worker, silicaOptional)) {
    draft[key] = worker[key] ?? "";
  }
  return draft;
}

export function getFilledBulkOnboardingFields(
  worker: BulkOnboardingWorker,
  silicaOptional = false
): BulkOnboardingFieldKey[] {
  return ALL_WORKER_FIELD_KEYS.filter(
    (key) =>
      worker[key].trim() &&
      !getInvalidBulkOnboardingFields(worker, silicaOptional).includes(key)
  );
}

export function parseIsoDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const date = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  const dmy = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = dmy[2].padStart(2, "0");
    const year = dmy[3];
    const date = new Date(`${year}-${month}-${day}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    if (date.getFullYear() !== Number(year)) return null;
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isDateField(key: BulkOnboardingFieldKey): boolean {
  return DATE_FIELDS.has(key);
}

export function validateBulkOnboardingField(
  key: BulkOnboardingFieldKey,
  value: string,
  silicaOptional = false
): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    if (optionalBulkOnboardingFields(silicaOptional).includes(key)) return null;
    if (key === "emergency_contact") return null;
    return `${BULK_ONBOARDING_FIELD_LABELS[key]} is required.`;
  }

  if (key === "email" && !EMAIL_PATTERN.test(trimmed)) {
    return "Enter a valid email address.";
  }

  if (key === "state" && !normalizeWorkerStateRegion(trimmed)) {
    return "State must be ACT, NSW, WA, or NZ.";
  }

  if (isDateField(key) && !parseIsoDate(trimmed)) {
    return "Enter a valid date.";
  }

  if (key === "postcode") {
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length < 3 || digits.length > 4) {
      return "Enter a valid 3 or 4 digit postcode.";
    }
  }

  if (key === "bank_bsb") {
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length !== 6) return "BSB must be 6 digits.";
  }

  if (key === "bank_account_number") {
    const digits = trimmed.replace(/\s+/g, "");
    if (digits.length < 4 || digits.length > 12) {
      return "Enter a valid bank account number.";
    }
  }

  if (key === "tfn") {
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 9) {
      return "TFN must be 8 or 9 digits.";
    }
  }

  return null;
}

export function getInvalidBulkOnboardingFields(
  worker: BulkOnboardingWorker,
  silicaOptional = false
): BulkOnboardingFieldKey[] {
  const keys: BulkOnboardingFieldKey[] = [
    ...BULK_ONBOARDING_CSV_HEADERS,
    ...BULK_ONBOARDING_COMPLIANCE_KEYS,
  ];

  return keys.filter((key) => {
    if (key === "emergency_contact" && worker.emergency_contact_name.trim()) {
      return false;
    }
    return validateBulkOnboardingField(key, worker[key], silicaOptional) !== null;
  });
}

export function normalizeBulkOnboardingWorker(
  worker: BulkOnboardingWorker
): BulkOnboardingWorker {
  const next: BulkOnboardingWorker = { ...worker };
  const state = normalizeWorkerStateRegion(worker.state);
  next.state = state ?? worker.state.trim().toUpperCase();
  next.email = worker.email.trim().toLowerCase();
  next.bank_bsb = formatWorkerBsb(worker.bank_bsb) ?? worker.bank_bsb.trim();
  next.emergency_contact =
    worker.emergency_contact.trim() || worker.emergency_contact_name.trim();
  next.white_card_photo_url = worker.white_card_photo_url?.trim() || "";
  next.white_card_doc_url = worker.white_card_doc_url?.trim() || "";
  next.silica_cert_photo_url = worker.silica_cert_photo_url?.trim() || "";
  next.silica_cert_doc_url = worker.silica_cert_doc_url?.trim() || "";
  next.drivers_licence_photo_url = worker.drivers_licence_photo_url?.trim() || "";
  next.assigned_project_id = worker.assigned_project_id?.trim() || "";
  next.assigned_project_name = worker.assigned_project_name?.trim() || "";
  next.tag_ids = [
    ...new Set(
      (Array.isArray(worker.tag_ids) ? worker.tag_ids : []).map((id) =>
        String(id).trim()
      ).filter(Boolean)
    ),
  ];
  next.vocs = Array.isArray(worker.vocs) ? worker.vocs : [];

  for (const key of DATE_FIELDS) {
    const parsed = parseIsoDate(worker[key]);
    if (parsed) next[key] = parsed;
  }

  return next;
}

export function workerDisplayName(worker: BulkOnboardingWorker): string {
  const name = [worker.first_name.trim(), worker.last_name.trim()]
    .filter(Boolean)
    .join(" ");
  return name || worker.email.trim() || `Row ${worker.rowIndex}`;
}

export function parseBulkOnboardingCsv(csvText: string): {
  workers: BulkOnboardingWorker[];
  error: string | null;
} {
  const parsed = Papa.parse<Record<string, unknown>>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => sanitizeCsvHeader(header),
  });

  if (parsed.errors.length > 0 && !parsed.data.length) {
    return {
      workers: [],
      error: parsed.errors[0]?.message ?? "Unable to parse the CSV file.",
    };
  }

  const cleanRows = parsed.data.map((row) => sanitizeParsedRow(row));
  const headers = new Set([
    ...(parsed.meta.fields ?? []).map((header) => sanitizeCsvHeader(header)),
    ...cleanRows.flatMap((row) => Object.keys(row)),
  ]);
  if (!headers.has("firstname") || !headers.has("lastname")) {
    return {
      workers: [],
      error: "CSV must include first name and last name columns.",
    };
  }

  const workers = cleanRows
    .map((cleanRow, index) => mapCleanRowToWorker(cleanRow, index + 2))
    .filter(
      (worker) =>
        worker.first_name.trim() ||
        worker.last_name.trim() ||
        ALL_WORKER_FIELD_KEYS.some((key) => worker[key].trim())
    );

  if (workers.length === 0) {
    return { workers: [], error: "The CSV file does not contain any worker rows." };
  }

  const emails = new Map<string, number>();
  for (const worker of workers) {
    const email = worker.email.trim().toLowerCase();
    if (!email) continue;
    if (emails.has(email)) {
      return {
        workers: [],
        error: `Duplicate email ${email} appears on rows ${emails.get(email)} and ${worker.rowIndex}.`,
      };
    }
    emails.set(email, worker.rowIndex);
  }

  return { workers, error: null };
}

export function serializeBulkOnboardingVocs(
  vocs: BulkOnboardingWorker["vocs"] | null | undefined
): BulkOnboardingVoc[] {
  if (!Array.isArray(vocs)) return [];
  return vocs
    .map((voc) => ({
      clientId: String(voc.clientId ?? "").trim() || crypto.randomUUID(),
      title: String(voc.title || voc.voc_type || "").trim(),
      voc_type: String(voc.voc_type || voc.title || "").trim(),
      issuing_org: String(voc.issuing_org || "").trim(),
      issue_date: String(voc.issue_date || "").trim(),
      expiry_date: String(voc.expiry_date || "").trim(),
      document_url: voc.document_url?.trim() || null,
    }))
    .filter(
      (voc) =>
        voc.title ||
        voc.voc_type ||
        voc.issuing_org ||
        voc.issue_date ||
        voc.expiry_date ||
        voc.document_url
    );
}
