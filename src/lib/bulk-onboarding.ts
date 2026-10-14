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

export type BulkOnboardingWorker = {
  rowIndex: number;
} & Record<BulkOnboardingFieldKey, string>;

export const OPTIONAL_BULK_ONBOARDING_FIELDS: readonly BulkOnboardingFieldKey[] = [
  "address_line_2",
];

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

function emptyComplianceFields(): Record<BulkOnboardingComplianceKey, string> {
  return {
    white_card_number: "",
    white_card_issue_date: "",
    silica_cert_number: "",
    silica_cert_issue_date: "",
    drivers_licence_number: "",
    drivers_licence_class: "",
    drivers_licence_expiry: "",
  };
}

function trimCell(value: unknown): string {
  if (value == null) return "";
  return String(value).replace(/^\uFEFF/, "").trim();
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
  value: string
): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    if (OPTIONAL_BULK_ONBOARDING_FIELDS.includes(key)) return null;
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
  worker: BulkOnboardingWorker
): BulkOnboardingFieldKey[] {
  const keys: BulkOnboardingFieldKey[] = [
    ...BULK_ONBOARDING_CSV_HEADERS,
    ...BULK_ONBOARDING_COMPLIANCE_KEYS,
  ];

  return keys.filter((key) => {
    if (key === "emergency_contact" && worker.emergency_contact_name.trim()) {
      return false;
    }
    return validateBulkOnboardingField(key, worker[key]) !== null;
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

function mapRowToWorker(
  row: Record<string, unknown>,
  rowIndex: number
): BulkOnboardingWorker {
  const csvFields = Object.fromEntries(
    BULK_ONBOARDING_CSV_HEADERS.map((key) => [key, trimCell(row[key])])
  ) as Record<BulkOnboardingCsvKey, string>;

  return {
    rowIndex,
    ...csvFields,
    ...emptyComplianceFields(),
  };
}

export function parseBulkOnboardingCsv(csvText: string): {
  workers: BulkOnboardingWorker[];
  error: string | null;
} {
  const parsed = Papa.parse<Record<string, unknown>>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.replace(/^\uFEFF/, "").trim().toLowerCase(),
  });

  if (parsed.errors.length > 0 && !parsed.data.length) {
    return {
      workers: [],
      error: parsed.errors[0]?.message ?? "Unable to parse the CSV file.",
    };
  }

  const headers = (parsed.meta.fields ?? []).map((header) =>
    header.replace(/^\uFEFF/, "").trim().toLowerCase()
  );
  const missing = BULK_ONBOARDING_CSV_HEADERS.filter(
    (header) => !headers.includes(header)
  );
  if (missing.length > 0) {
    return {
      workers: [],
      error: `CSV is missing required headers: ${missing.join(", ")}.`,
    };
  }

  const workers = parsed.data
    .map((row, index) => mapRowToWorker(row ?? {}, index + 2))
    .filter((worker) =>
      BULK_ONBOARDING_CSV_HEADERS.some((key) => worker[key].trim())
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
