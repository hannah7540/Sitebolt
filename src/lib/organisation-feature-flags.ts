import { A_PLUS_ORGANISATION_ID } from "@/lib/active-organisation";

export const CORE_MODULE_KEYS = [
  "projects",
  "administration",
  "subcontractors",
  "accounts",
  "communication",
  "organisation",
] as const;

export const TOOL_MODULE_KEYS = [
  "plant",
  "swms",
  "itp_itc",
  "calendars",
  "insurance",
] as const;

export const FEATURE_MODULE_KEYS = [...CORE_MODULE_KEYS, ...TOOL_MODULE_KEYS] as const;

export const WORKER_FIELD_KEYS = [
  "drivers_licence",
  "white_card",
  "high_risk_licences",
  "emergency_contact",
  "medical",
  "pay_rates",
  "app_pin",
] as const;

export type FeatureModuleKey = (typeof FEATURE_MODULE_KEYS)[number];
export type WorkerFieldKey = (typeof WORKER_FIELD_KEYS)[number];

export const OPERATING_STATE_OPTIONS = [
  { id: "ACT", label: "ACT - Australian Capital Territory" },
  { id: "NSW", label: "NSW - New South Wales" },
  { id: "NT", label: "NT - Northern Territory" },
  { id: "QLD", label: "QLD - Queensland" },
  { id: "SA", label: "SA - South Australia" },
  { id: "TAS", label: "TAS - Tasmania" },
  { id: "VIC", label: "VIC - Victoria" },
  { id: "WA", label: "WA - Western Australia" },
  { id: "NZ", label: "NZ - New Zealand" },
] as const;

export type OperatingStateId = (typeof OPERATING_STATE_OPTIONS)[number]["id"];

export const OPERATING_STATE_IDS: OperatingStateId[] = OPERATING_STATE_OPTIONS.map(
  (item) => item.id
);

export interface OrganisationFeatureFlags {
  modules: Record<FeatureModuleKey, boolean>;
  workerFields: Record<WorkerFieldKey, boolean>;
  operating_states: OperatingStateId[];
}

export const CORE_MODULE_CATALOG: Array<{
  id: FeatureModuleKey;
  label: string;
  description: string;
}> = [
  {
    id: "projects",
    label: "Projects",
    description: "Active sites, stages, documents",
  },
  {
    id: "administration",
    label: "Administration",
    description: "Company records, registers, compliance packs",
  },
  {
    id: "subcontractors",
    label: "Subcontractors",
    description: "Subbie portal, insurance checks, contact logs",
  },
  {
    id: "accounts",
    label: "Accounts & Timesheets",
    description: "Digital shift sign-offs, award pay rules, MYOB exports",
  },
  {
    id: "communication",
    label: "Communication",
    description: "Broadcast notices, site alerts, worker SMS/email",
  },
  {
    id: "organisation",
    label: "Organisation",
    description: "Master company settings, policy vault",
  },
];

export const TOOL_MODULE_CATALOG: Array<{
  id: FeatureModuleKey;
  label: string;
  description: string;
}> = [
  {
    id: "plant",
    label: "Plant, Fleet & QR Codes",
    description: "Asset registers, service countdowns, QR pre-starts",
  },
  {
    id: "swms",
    label: "Safety & SWMS",
    description: "31-day rolling reviews, on-site digital worker signatures",
  },
  {
    id: "itp_itc",
    label: "Quality Assurance ITP / ITC",
    description: "Checklists, defect logs, photo pins",
  },
  {
    id: "calendars",
    label: "Unified Calendars",
    description: "Worker site allocations & plant equipment schedules",
  },
  {
    id: "insurance",
    label: "Insurance & Ticket Tracking",
    description: "Automated expiry countdowns & alerts",
  },
];

export const WORKER_FIELD_CATALOG: Array<{
  id: WorkerFieldKey;
  label: string;
}> = [
  { id: "drivers_licence", label: "Driver's Licence Number & Expiry" },
  { id: "white_card", label: "White Card / Construction Induction Card Number" },
  { id: "high_risk_licences", label: "High-Risk Work Licences / Machinery Tickets" },
  { id: "emergency_contact", label: "Emergency Contact Details" },
  { id: "medical", label: "Medical & Allergy Disclosures" },
  { id: "pay_rates", label: "Pay Rates / Award Classification" },
  { id: "app_pin", label: "Mobile App PIN / Direct Login Credentials" },
];

function allTrueRecord<K extends string>(keys: readonly K[]): Record<K, boolean> {
  return Object.fromEntries(keys.map((key) => [key, true])) as Record<K, boolean>;
}

export function isOperatingStateId(value: string | null | undefined): value is OperatingStateId {
  if (!value) return false;
  return (OPERATING_STATE_IDS as readonly string[]).includes(value);
}

export function parseOperatingStates(
  raw: unknown,
  fallback?: string | string[] | null
): OperatingStateId[] {
  const collected: string[] = [];
  if (Array.isArray(raw)) {
    collected.push(...raw.map((item) => String(item ?? "").trim().toUpperCase()));
  } else if (typeof raw === "string" && raw.trim()) {
    collected.push(
      ...raw
        .split(/[,\s]+/)
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean)
    );
  }
  if (collected.length === 0) {
    const fallbackItems = Array.isArray(fallback) ? fallback : [fallback];
    collected.push(
      ...fallbackItems.map((item) => String(item ?? "").trim().toUpperCase()).filter(Boolean)
    );
  }
  const unique = new Set<OperatingStateId>();
  for (const item of collected) {
    if (isOperatingStateId(item)) unique.add(item);
  }
  return OPERATING_STATE_IDS.filter((id) => unique.has(id));
}

export function createAllEnabledFeatureFlags(
  operatingStates: OperatingStateId[] = []
): OrganisationFeatureFlags {
  return {
    modules: allTrueRecord(FEATURE_MODULE_KEYS),
    workerFields: allTrueRecord(WORKER_FIELD_KEYS),
    operating_states: parseOperatingStates(operatingStates),
  };
}

export const ALL_ENABLED_FEATURE_FLAGS = createAllEnabledFeatureFlags();

const LEGACY_MODULE_MAP: Record<string, FeatureModuleKey> = {
  plant_qr: "plant",
  swms: "swms",
  timesheets: "accounts",
  itp_itc: "itp_itc",
};

function readBooleanMap(
  value: unknown,
  keys: readonly string[],
  fallback = true
): Record<string, boolean> {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const result: Record<string, boolean> = {};
  for (const key of keys) {
    result[key] = source[key] === false ? false : fallback ? source[key] !== false : Boolean(source[key]);
  }
  return result;
}

export function parseOrganisationFeatureFlags(
  raw: unknown,
  organisationId?: string | null,
  fallbackState?: string | string[] | null
): OrganisationFeatureFlags {
  const record =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const operatingStates = parseOperatingStates(
    record.operating_states ?? record.operatingStates,
    fallbackState
  );

  if (organisationId === A_PLUS_ORGANISATION_ID) {
    return createAllEnabledFeatureFlags(operatingStates.length > 0 ? operatingStates : ["ACT"]);
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return createAllEnabledFeatureFlags(operatingStates);
  }

  const modulesSource = record.modules ?? record;
  const workerSource = record.workerFields ?? record.worker_fields ?? {};

  return {
    modules: readBooleanMap(modulesSource, FEATURE_MODULE_KEYS) as Record<
      FeatureModuleKey,
      boolean
    >,
    workerFields: readBooleanMap(workerSource, WORKER_FIELD_KEYS) as Record<
      WorkerFieldKey,
      boolean
    >,
    operating_states: operatingStates,
  };
}

export function flagsFromLegacyModules(modules: string[]): OrganisationFeatureFlags {
  const flags = createAllEnabledFeatureFlags();
  if (modules.length === 0) return flags;
  const enabled = new Set<FeatureModuleKey>();
  for (const item of modules) {
    if ((FEATURE_MODULE_KEYS as readonly string[]).includes(item)) {
      enabled.add(item as FeatureModuleKey);
    } else if (LEGACY_MODULE_MAP[item]) {
      enabled.add(LEGACY_MODULE_MAP[item]);
    }
  }
  if (enabled.size === 0) return flags;
  for (const key of FEATURE_MODULE_KEYS) {
    if (key === "projects" || key === "administration" || key === "organisation") continue;
    flags.modules[key] = enabled.has(key);
  }
  return flags;
}

export function serializeOrganisationFeatureFlags(
  flags: OrganisationFeatureFlags,
  organisationId?: string | null
): OrganisationFeatureFlags {
  if (organisationId === A_PLUS_ORGANISATION_ID) {
    return createAllEnabledFeatureFlags(flags.operating_states);
  }
  return parseOrganisationFeatureFlags(flags, organisationId, flags.operating_states);
}

export function isFeatureModuleEnabled(
  flags: OrganisationFeatureFlags | null | undefined,
  key: FeatureModuleKey,
  organisationId?: string | null
): boolean {
  if (organisationId === A_PLUS_ORGANISATION_ID) return true;
  return flags?.modules[key] !== false;
}

export function isWorkerFieldEnabled(
  flags: OrganisationFeatureFlags | null | undefined,
  key: WorkerFieldKey,
  organisationId?: string | null
): boolean {
  if (organisationId === A_PLUS_ORGANISATION_ID) return true;
  return flags?.workerFields[key] !== false;
}

export function toggleFeatureFlag<
  T extends "modules" | "workerFields",
>(
  flags: OrganisationFeatureFlags,
  group: T,
  key: T extends "modules" ? FeatureModuleKey : WorkerFieldKey,
  enabled: boolean
): OrganisationFeatureFlags {
  if (group === "modules") {
    return {
      ...flags,
      operating_states: flags.operating_states,
      modules: { ...flags.modules, [key]: enabled },
    };
  }
  return {
    ...flags,
    operating_states: flags.operating_states,
    workerFields: { ...flags.workerFields, [key]: enabled },
  };
}

export function withOperatingStates(
  flags: OrganisationFeatureFlags,
  operatingStates: OperatingStateId[]
): OrganisationFeatureFlags {
  return {
    ...flags,
    operating_states: parseOperatingStates(operatingStates),
  };
}
