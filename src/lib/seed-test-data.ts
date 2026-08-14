/**
 * Comprehensive test-data seed — populates realistic demo data across SiteBolt modules.
 *
 * Does NOT wipe or overwrite standard system induction templates.
 *
 * Usage (via CLI):
 *   npm run seed:test-data
 *   npm run seed:test-data -- --cleanup
 */

import { randomUUID } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { buildSiteFormInsertPayload } from "./site-form-payload";
import type { SiteFormData } from "./site-forms";
import { buildSubcontractorPlantPayload } from "./subcontractor-plant-payload";
import { insertWithFormMetadataFallback } from "./form-metadata-consolidation";
import { parseMissingColumnFromError } from "./form-payload-utils";
import {
  normalizeWorkerUuidArray,
} from "./project-resolver";
import { profileRoleToAccountsAccessRole, type ProfileRole } from "./platform-roles";
import type { SecurityRole } from "./security-roles";
import type { PrestartTemplate } from "./prestart-templates";
import {
  calculateDailyTotalsFromSlots,
  type TimesheetActivitySlot,
  type TimesheetBreakSlot,
} from "./timesheet-utils";
import { syncLineItemFields, type TimesheetLineCategory } from "./timesheet-line-items";
import type { WorkerStateRegion } from "./worker-state-region";
import {
  MASTER_ADMIN_FIRST_NAME,
  MASTER_ADMIN_FULL_NAME,
  MASTER_ADMIN_LAST_NAME,
  MASTER_ADMIN_ROLE,
} from "./master-admin-config";
import { runMasterAdminSeed } from "./master-admin-seed";
import { loadStandardInductionTemplates } from "../../scripts/lib/standard-induction-seed";

export const SEED_TAG = "COMPREHENSIVE-TEST-SEED";
export const SEED_EMAIL_DOMAIN = "test-data.sitebolt.local";
const PLANT_UNIT_PREFIX = "TDATA-";
const MOCK_SIGNATURE = "https://example.com/seed/test-data-signature.png";

export interface SeedWorkerRecord {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  role: SecurityRole;
  trade: string;
  state: WorkerStateRegion;
  phone: string;
  emergencyContact: string;
}

export interface SeedProjectRecord {
  id: string;
  name: string;
  slug: string;
  location: string;
}

export interface SeedPlantRecord {
  id: string;
  unitNumber: string;
  displayName: string;
  template: PrestartTemplate;
  currentHours: number;
  nextServiceHours: number;
  lastServiceDate: string;
}

export interface ComprehensiveSeedSummary {
  workers: number;
  projects: number;
  plant: number;
  plantPrestarts: number;
  siteForms: number;
  swmsDocuments: number;
  swmsAssignments: number;
  inductionAssignments: number;
  timesheets: number;
  leaveRequests: number;
  actWorkers: number;
  waWorkers: number;
  regionalTimesheets: number;
}

interface RoleUserSpec {
  role: SecurityRole;
  firstName: string;
  lastName: string;
  key: string;
  trade: string;
}

interface GeneralWorkerSpec {
  firstName: string;
  lastName: string;
  key: string;
  trade: string;
  state?: WorkerStateRegion;
  crew?: string;
}

const ROLE_USER_SPECS: RoleUserSpec[] = [
  {
    role: "full_access",
    firstName: "Felix",
    lastName: "Fuller",
    key: "full_access",
    trade: "Operations Manager",
  },
  {
    role: "super_admin",
    firstName: "Sam",
    lastName: "Supervisor",
    key: "super_admin",
    trade: "Super Admin",
  },
  {
    role: "project_super_admin",
    firstName: "Paige",
    lastName: "ProjectSuper",
    key: "project_super_admin",
    trade: "Project Super Admin",
  },
  {
    role: "project_admin",
    firstName: "Adam",
    lastName: "ProjectAdmin",
    key: "project_admin",
    trade: "Project Administrator",
  },
];

const GENERAL_WORKER_SPECS: GeneralWorkerSpec[] = [
  { firstName: "Jack", lastName: "Mason", key: "gw1", trade: "Plumber", state: "NSW" },
  { firstName: "Lily", lastName: "Chen", key: "gw2", trade: "Labourer", state: "NSW" },
  { firstName: "Noah", lastName: "Singh", key: "gw3", trade: "Operator", state: "NSW" },
  { firstName: "Ruby", lastName: "Walsh", key: "gw4", trade: "Labourer", state: "NSW" },
  { firstName: "Ethan", lastName: "Brooks", key: "gw5", trade: "Apprentice", state: "NSW" },
];

const ACT_WORKER_SPECS: GeneralWorkerSpec[] = [
  {
    firstName: "Harper",
    lastName: "Acton",
    key: "act1",
    trade: "Plumber",
    state: "ACT",
    crew: "Canberra Metro Site Crew",
  },
  {
    firstName: "Mitchell",
    lastName: "Braddon",
    key: "act2",
    trade: "Labourer",
    state: "ACT",
    crew: "Canberra Metro Site Crew",
  },
];

const WA_WORKER_SPECS: GeneralWorkerSpec[] = [
  {
    firstName: "Piper",
    lastName: "Henderson",
    key: "wa1",
    trade: "Operator",
    state: "WA",
    crew: "Perth / Pilbara Regional Crew",
  },
  {
    firstName: "Flynn",
    lastName: "Karratha",
    key: "wa2",
    trade: "Labourer",
    state: "WA",
    crew: "Perth / Pilbara Regional Crew",
  },
];

const PROJECT_SPECS = [
  {
    name: "Marsden Park Commercial Phase 2",
    slug: "marsden-park-commercial-phase-2",
    location: "Marsden Park, NSW",
    client: "A Plus Plumbing",
    code: "MP-PH2",
  },
  {
    name: "Western Sydney Link",
    slug: "western-sydney-link",
    location: "Western Sydney, NSW",
    client: "Major Roads NSW",
    code: "WSL-2026",
  },
  {
    name: "Canberra Light Rail Depot",
    slug: "canberra-light-rail-depot",
    location: "Canberra, ACT",
    client: "ACT Transport",
    code: "CLR-DEPOT",
  },
  {
    name: "Perth Commercial Hub",
    slug: "perth-commercial-hub",
    location: "Perth, WA",
    client: "Western Build Co",
    code: "PCH-2026",
  },
];

const PLANT_SPECS = [
  {
    unitNumber: `${PLANT_UNIT_PREFIX}CAT320`,
    displayName: "Excavator CAT 320",
    category: "Excavator",
    make: "Caterpillar",
    model: "320",
    serialNumber: "CAT320TDATA001",
    registrationCode: "TDATA-320",
    template: "excavator" as PrestartTemplate,
    currentHours: 4210,
    nextServiceHours: 4500,
    lastServiceDate: "2026-07-05",
    serviceIntervalHours: 250,
  },
  {
    unitNumber: `${PLANT_UNIT_PREFIX}JCB540`,
    displayName: "JCB Telehandler",
    category: "Telehandler",
    make: "JCB",
    model: "540-170",
    serialNumber: "JCB540TDATA002",
    registrationCode: "TDATA-TH",
    template: "loader" as PrestartTemplate,
    currentHours: 1980,
    nextServiceHours: 2250,
    lastServiceDate: "2026-07-28",
    serviceIntervalHours: 250,
  },
  {
    unitNumber: `${PLANT_UNIT_PREFIX}HILTI`,
    displayName: "Hilti Core Drill",
    category: "Small Plant",
    make: "Hilti",
    model: "DD 250-CA",
    serialNumber: "HILTITDATA003",
    registrationCode: "TDATA-DRILL",
    template: "excavator" as PrestartTemplate,
    currentHours: 420,
    nextServiceHours: 500,
    lastServiceDate: "2026-06-12",
    serviceIntervalHours: 100,
  },
  {
    unitNumber: `${PLANT_UNIT_PREFIX}HILUX`,
    displayName: "Toyota Hilux Fleet Unit",
    category: "Light Vehicle",
    make: "Toyota",
    model: "Hilux SR5",
    serialNumber: "HILUXTDATA004",
    registrationCode: "TDATA-UTE",
    template: "truck" as PrestartTemplate,
    currentHours: 68400,
    nextServiceHours: 70000,
    lastServiceDate: "2026-08-01",
    serviceIntervalHours: 10000,
  },
];

function seedEmail(localPart: string): string {
  return `${localPart}@${SEED_EMAIL_DOMAIN}`;
}

function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getSeedWeekDates(reference = new Date()): string[] {
  const monday = new Date(reference);
  const day = monday.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  monday.setDate(monday.getDate() + diff);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return formatIsoDate(date);
  });
}

function addDaysIso(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + days);
  return formatIsoDate(date);
}

function isoDateTime(isoDate: string, time = "06:30:00"): string {
  return `${isoDate}T${time}.000Z`;
}

async function insertWithVariants(
  supabase: SupabaseClient,
  table: string,
  variants: Record<string, unknown>[],
  select = "id"
): Promise<{ id: string | null; error: string | null }> {
  let lastError: string | null = null;

  for (const variant of variants) {
    let payload = { ...variant };

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const { data, error } = await supabase.from(table).insert([payload]).select(select).single();
      const row = data as { id?: unknown } | null;
      if (!error) {
        return { id: row?.id ? String(row.id) : null, error: null };
      }

      lastError = error.message;
      const missing = parseMissingColumnFromError(error.message);
      if (!missing || !(missing in payload)) break;
      const { [missing]: _removed, ...rest } = payload;
      payload = rest;
    }
  }

  return { id: null, error: lastError ?? `Could not insert into ${table}.` };
}

async function findAuthUserByEmail(admin: SupabaseClient, email: string): Promise<User | null> {
  const target = email.trim().toLowerCase();
  let page = 1;

  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Failed to list auth users: ${error.message}`);

    const match = data.users.find((user) => user.email?.trim().toLowerCase() === target);
    if (match) return match;
    if (data.users.length < 200) break;
    page += 1;
  }

  return null;
}

async function ensureAuthUser(
  admin: SupabaseClient,
  options: { email: string; fullName: string; role: ProfileRole }
): Promise<User> {
  const existing = await findAuthUserByEmail(admin, options.email);
  if (existing) {
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
      email_confirm: true,
      user_metadata: {
        ...existing.user_metadata,
        role: options.role,
        full_name: options.fullName,
      },
      app_metadata: {
        ...existing.app_metadata,
        role: options.role,
      },
    });
    if (error) throw new Error(`Failed to update auth user ${options.email}: ${error.message}`);
    return data.user;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: options.email,
    email_confirm: true,
    user_metadata: { role: options.role, full_name: options.fullName },
    app_metadata: { role: options.role },
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? `Failed to create auth user for ${options.email}.`);
  }

  return data.user;
}

async function ensureProfileRecord(
  supabase: SupabaseClient,
  options: { authUserId: string; email: string; fullName: string; workerId: string; role: ProfileRole }
): Promise<void> {
  const { error } = await supabase.from("profiles").upsert(
    [
      {
        id: options.authUserId,
        email: options.email,
        full_name: options.fullName,
        role: options.role,
        worker_id: options.workerId,
        updated_at: new Date().toISOString(),
      },
    ],
    { onConflict: "id" }
  );

  if (error && !error.message.toLowerCase().includes("schema cache")) {
    console.warn(`profiles upsert for ${options.email}: ${error.message}`);
  }
}

async function upsertSeedWorker(
  supabase: SupabaseClient,
  admin: SupabaseClient | null,
  options: {
    firstName: string;
    lastName: string;
    email: string;
    role: SecurityRole;
    trade: string;
    state?: WorkerStateRegion;
    crew?: string;
    phone: string;
    emergencyContact: string;
    assignedProjectId?: string | null;
  }
): Promise<SeedWorkerRecord> {
  const fullName = `${options.firstName} ${options.lastName}`.trim();
  const workerState = options.state ?? "NSW";
  const accountsRole = profileRoleToAccountsAccessRole(options.role as ProfileRole);

  let authUserId: string | null = null;
  if (admin) {
    const authUser = await ensureAuthUser(admin, {
      email: options.email,
      fullName,
      role: options.role as ProfileRole,
    });
    authUserId = authUser.id;
  }

  const { data: existing } = await supabase
    .from("workers")
    .select("id")
    .eq("email", options.email)
    .maybeSingle();

  const payloadVariants: Record<string, unknown>[] = [
    {
      first_name: options.firstName,
      last_name: options.lastName,
      full_name: fullName,
      email: options.email,
      phone: options.phone,
      emergency_contact: options.emergencyContact,
      auth_user_id: authUserId,
      security_role: options.role,
      accounts_access_role: accountsRole,
      can_access_accounts: accountsRole === "full_access",
      status: "active",
      state: workerState,
      trade: options.trade,
      assigned_project_id: options.assignedProjectId ?? null,
      notes: options.crew
        ? `${SEED_TAG} · ${options.crew}`
        : `${SEED_TAG} · ${options.role}`,
      updated_at: new Date().toISOString(),
    },
    {
      first_name: options.firstName,
      last_name: options.lastName,
      full_name: fullName,
      email: options.email,
      phone: options.phone,
      emergency_contact: options.emergencyContact,
      security_role: options.role,
      status: "active",
      state: workerState,
      trade: options.trade,
      notes: options.crew ? `${SEED_TAG} · ${options.crew}` : SEED_TAG,
    },
  ];

  let workerId = existing?.id ? String(existing.id) : null;

  if (workerId) {
    for (const payload of payloadVariants) {
      const { error } = await supabase.from("workers").update(payload).eq("id", workerId);
      if (!error) break;
    }
  } else {
    const inserted = await insertWithVariants(supabase, "workers", payloadVariants);
    if (!inserted.id) {
      throw new Error(`Failed to create worker ${options.email}: ${inserted.error}`);
    }
    workerId = inserted.id;
  }

  if (admin && authUserId) {
    await ensureProfileRecord(supabase, {
      authUserId,
      email: options.email,
      fullName,
      workerId,
      role: options.role as ProfileRole,
    });
  }

  return {
    id: workerId,
    firstName: options.firstName,
    lastName: options.lastName,
    fullName,
    email: options.email,
    role: options.role,
    trade: options.trade,
    state: workerState,
    phone: options.phone,
    emergencyContact: options.emergencyContact,
  };
}

function slugifyProjectName(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "project"
  );
}

async function ensureSeedProjects(
  supabase: SupabaseClient,
  projectManagerId: string,
  projectAdminId: string,
  workerAssignmentsBySlug: Record<string, string[]>
): Promise<SeedProjectRecord[]> {
  const { data: existingRows, error: fetchError } = await supabase
    .from("projects")
    .select("id, project_name, slug, location")
    .order("project_name", { ascending: true });

  if (fetchError) {
    throw new Error(`Failed to fetch projects: ${fetchError.message}`);
  }

  const results: SeedProjectRecord[] = [];

  for (const spec of PROJECT_SPECS) {
    const assignedWorkers = workerAssignmentsBySlug[spec.slug] ?? [];
    const slug = spec.slug || slugifyProjectName(spec.name);
    const found = (existingRows ?? []).find(
      (row) =>
        String(row.slug ?? "") === slug ||
        String(row.project_name ?? "").toLowerCase() === spec.name.toLowerCase()
    );

    const payloadVariants: Record<string, unknown>[] = [
      {
        project_name: spec.name,
        slug,
        location: spec.location,
        project_code: spec.code,
        client: spec.client,
        project_managers: normalizeWorkerUuidArray([projectManagerId]),
        project_administrators: normalizeWorkerUuidArray([projectAdminId]),
        project_admins: normalizeWorkerUuidArray([projectAdminId]),
        assigned_workers: normalizeWorkerUuidArray(assignedWorkers),
        is_active: true,
        is_archived: false,
        status: "Active",
        updated_at: new Date().toISOString(),
      },
      {
        project_name: spec.name,
        slug,
        location: spec.location,
        client: spec.client,
        project_admins: normalizeWorkerUuidArray([projectAdminId]),
        assigned_workers: normalizeWorkerUuidArray(assignedWorkers),
        is_active: true,
        status: "Active",
      },
      {
        project_name: spec.name,
        slug,
        location: spec.location,
        is_active: true,
      },
    ];

    if (found?.id) {
      for (const payload of payloadVariants) {
        const { error } = await supabase.from("projects").update(payload).eq("id", found.id);
        if (!error) break;
        if (!error.message.toLowerCase().includes("schema cache")) {
          console.warn(`Update project ${spec.name}: ${error.message}`);
        }
      }
      results.push({
        id: String(found.id),
        name: spec.name,
        slug,
        location: spec.location,
      });
      continue;
    }

    const inserted = await insertWithVariants(supabase, "projects", payloadVariants);
    if (!inserted.id) {
      throw new Error(`Failed to create project ${spec.name}: ${inserted.error}`);
    }

    results.push({
      id: inserted.id,
      name: spec.name,
      slug,
      location: spec.location,
    });
  }

  return results;
}

async function upsertSeedPlant(
  supabase: SupabaseClient,
  spec: (typeof PLANT_SPECS)[number],
  project: SeedProjectRecord,
  projectIndex: number
): Promise<SeedPlantRecord> {
  const status = projectIndex % 2 === 0 ? "allocated" : "available";

  const ownedPayloadVariants: Record<string, unknown>[] = [
    {
      unit_number: spec.unitNumber,
      name: spec.displayName,
      category: spec.category,
      make: spec.make,
      model: spec.model,
      serial_number: spec.serialNumber,
      registration_code: spec.registrationCode,
      prestart_template: spec.template,
      current_hours: spec.currentHours,
      next_service_hours: spec.nextServiceHours,
      last_service_date: spec.lastServiceDate,
      status,
      assigned_project_id: project.id,
      assigned_project_name: project.name,
      project_id: project.id,
      project_name: project.name,
      ownership_type: "Owned",
      notes: `${SEED_TAG} · ${spec.displayName}`,
      updated_at: new Date().toISOString(),
    },
    {
      unit_number: spec.unitNumber,
      category: spec.category,
      make: spec.make,
      model: spec.model,
      prestart_template: spec.template,
      current_hours: spec.currentHours,
      next_service_hours: spec.nextServiceHours,
      status,
      assigned_project_id: project.id,
    },
  ];

  const { data: existing } = await supabase
    .from("plant")
    .select("id")
    .eq("unit_number", spec.unitNumber)
    .maybeSingle();

  let plantId = existing?.id ? String(existing.id) : null;

  if (plantId) {
    for (const payload of ownedPayloadVariants) {
      const { error } = await supabase.from("plant").update(payload).eq("id", plantId);
      if (!error) break;
    }
  } else {
    const inserted = await insertWithVariants(supabase, "plant", ownedPayloadVariants);
    if (!inserted.id) throw new Error(`Insert plant ${spec.unitNumber}: ${inserted.error}`);
    plantId = inserted.id;
  }

  const equipmentPayload = buildSubcontractorPlantPayload({
    subcontractorId: "",
    unitNumber: spec.unitNumber,
    equipmentCategory: spec.category,
    make: spec.make,
    model: spec.model,
    serialNumber: spec.serialNumber,
    currentHours: spec.currentHours,
    nextServiceHours: spec.nextServiceHours,
    lastServiceDate: spec.lastServiceDate,
    assignedProjectId: project.id,
    notes: `${SEED_TAG} · ${spec.serviceIntervalHours}hr service interval`,
    serviceHistoryDocUrl: "https://example.com/seed/test-data/service-history.pdf",
    plantRiskAssessmentDocUrl: "https://example.com/seed/test-data/plant-risk.pdf",
  });
  equipmentPayload.is_subcontractor_plant = false;
  equipmentPayload.ownership_type = "Owned";
  equipmentPayload.status = status === "allocated" ? "Allocated" : "Available";
  equipmentPayload.name = spec.displayName;
  equipmentPayload.registration_code = spec.registrationCode;

  const { data: existingEquipment } = await supabase
    .from("plant_equipment")
    .select("id")
    .eq("unit_number", spec.unitNumber)
    .maybeSingle();

  if (existingEquipment?.id) {
    await supabase.from("plant_equipment").update(equipmentPayload).eq("id", existingEquipment.id);
  } else {
    await insertWithVariants(supabase, "plant_equipment", [equipmentPayload]);
  }

  await supabase.from("project_plant_assignments").upsert(
    [
      {
        project_id: project.id,
        plant_id: plantId,
        plant_name: spec.displayName,
        project_name: project.name,
        status: "Assigned",
      },
    ],
    { onConflict: "project_id,plant_id", ignoreDuplicates: true }
  );

  const pastServiceDate = addDaysIso(spec.lastServiceDate, -90);
  await insertWithVariants(supabase, "plant_service_schedules", [
    {
      plant_id: plantId,
      unit_number: spec.unitNumber,
      plant_name: spec.displayName,
      scheduled_date: pastServiceDate,
      service_date: pastServiceDate,
      service_type: "Completed Service",
      service_hours: spec.currentHours - spec.serviceIntervalHours,
      status: "Completed",
      completed: true,
      notes: `${SEED_TAG} · Past maintenance log`,
    },
    {
      plant_id: plantId,
      unit_number: spec.unitNumber,
      plant_name: spec.displayName,
      scheduled_date: addDaysIso(formatIsoDate(new Date()), 14),
      service_type: "Upcoming Service Due",
      service_hours: spec.nextServiceHours,
      status: "Scheduled",
      completed: false,
      notes: `${SEED_TAG} · Upcoming service due`,
    },
  ]);

  return {
    id: plantId,
    unitNumber: spec.unitNumber,
    displayName: spec.displayName,
    template: spec.template,
    currentHours: spec.currentHours,
    nextServiceHours: spec.nextServiceHours,
    lastServiceDate: spec.lastServiceDate,
  };
}

function buildPrestartCheckData(template: PrestartTemplate, hours: number, nextService: number) {
  return {
    ownership: "A Plus",
    hours,
    next_service: nextService,
    engine_oil: "OK",
    coolant: "OK",
    seat_belt: "OK",
    tag: SEED_TAG,
    ...(template === "truck"
      ? { kms: hours, tyres: "OK", brakes: "OK" }
      : { hydraulic_oil: "OK", hazard_light: "OK" }),
  };
}

async function seedPlantPrestarts(
  supabase: SupabaseClient,
  plants: SeedPlantRecord[],
  workers: SeedWorkerRecord[],
  projects: SeedProjectRecord[]
): Promise<number> {
  const weekDates = getSeedWeekDates();
  const formDates = weekDates.slice(0, 5);
  let count = 0;

  for (let index = 0; index < formDates.length; index += 1) {
    const plant = plants[index % plants.length]!;
    const worker = workers.find((row) => row.role === "general_worker") ?? workers[0]!;
    const project = projects[index % projects.length]!;
    const formDate = formDates[index]!;
    const openDefect = index === formDates.length - 1;

    const payload = {
      plant_id: plant.id,
      operator_name: worker.fullName,
      operator_worker_id: worker.id,
      project_id: project.id,
      site_id: project.id,
      current_reading: plant.currentHours + index * 6,
      next_service_due: plant.nextServiceHours,
      check_data: buildPrestartCheckData(plant.template, plant.currentHours, plant.nextServiceHours),
      has_defect: openDefect,
      defect_summary: openDefect ? "Hydraulic hose weeping — monitor daily" : null,
      defect_comments: openDefect ? `${SEED_TAG} · Open defect flagged during pre-start` : null,
      defect_status: openDefect ? "open" : "resolved",
      signature_url: MOCK_SIGNATURE,
      submitted_at: isoDateTime(formDate, "05:30:00"),
      created_at: isoDateTime(formDate, "05:30:00"),
    };

    const result = await insertWithFormMetadataFallback(supabase, "plant_prestarts", payload);
    if (!result.error) count += 1;
  }

  return count;
}

async function seedSafetyAndMeetings(
  supabase: SupabaseClient,
  workers: SeedWorkerRecord[],
  projects: SeedProjectRecord[]
): Promise<number> {
  let count = 0;
  const weekDates = getSeedWeekDates();
  const generalWorkers = workers.filter((row) => row.role === "general_worker");
  const submitter = generalWorkers[0] ?? workers[0]!;
  const projectOne = projects[0]!;
  const projectTwo = projects[1] ?? projects[0]!;

  const safetyWalks = [
    {
      project: projectOne,
      title: "Marsden Park Weekly Safety Walk — Clean",
      status: "Completed",
      formData: {
        client: "A Plus",
        description_of_works: "General site inspection — compliant",
        hazards_to_report: "no",
        seed_tag: SEED_TAG,
      },
      isViewed: false,
    },
    {
      project: projectTwo,
      title: "Highway Corridor Safety Walk — Clean",
      status: "Completed",
      formData: {
        client: "Major Roads NSW",
        description_of_works: "Traffic management and exclusion zones verified",
        hazards_to_report: "no",
        seed_tag: SEED_TAG,
      },
      isViewed: false,
    },
    {
      project: projectOne,
      title: "Excavation Zone Safety Walk — Open Hazard",
      status: "Open",
      formData: {
        client: "A Plus",
        description_of_works: "Excavation barricade damage noted near grid B4",
        hazards_to_report: "yes",
        hazards_to_report_photo_url: "https://example.com/seed/test-data/open-hazard.jpg",
        seed_tag: SEED_TAG,
      },
      isViewed: false,
    },
  ];

  for (const [index, walk] of safetyWalks.entries()) {
    const payload = buildSiteFormInsertPayload({
      formType: "safety_walk",
      projectId: walk.project.id,
      workerId: generalWorkers[index % generalWorkers.length]?.id ?? submitter.id,
      formDate: weekDates[index] ?? weekDates[0]!,
      formTime: "07:15:00",
      title: walk.title,
      status: walk.status,
      projectName: walk.project.name,
      notes: `${SEED_TAG} · ${walk.title}`,
      formData: walk.formData as SiteFormData,
      photoUrls: ["https://example.com/seed/test-data/safety-walk.jpg"],
      attendees: generalWorkers.slice(0, 3).map((worker) => ({
        worker_id: worker.id,
        worker_name: worker.fullName,
        present: true,
        signature_url: MOCK_SIGNATURE,
      })),
      submitterSignatureUrl: MOCK_SIGNATURE,
    });
    payload.is_viewed = walk.isViewed;
    payload.viewed_at = null;

    const result = await insertWithFormMetadataFallback(supabase, "site_forms", payload);
    if (!result.error) count += 1;
  }

  const toolboxTalks = [
    {
      subject: "Working at Heights Controls",
      pdfUrl: "https://example.com/seed/test-data/toolbox-heights.pdf",
    },
    {
      subject: "Excavation Exclusion Zones",
      pdfUrl: "https://example.com/seed/test-data/toolbox-excavation.pdf",
    },
  ];

  for (const [index, talk] of toolboxTalks.entries()) {
    const payload = buildSiteFormInsertPayload({
      formType: "toolbox_talk",
      projectId: projectOne.id,
      workerId: generalWorkers[(index + 1) % generalWorkers.length]?.id ?? submitter.id,
      formDate: weekDates[index + 1] ?? weekDates[0]!,
      formTime: "06:35:00",
      title: `Toolbox Talk — ${talk.subject}`,
      status: "Completed",
      projectName: projectOne.name,
      notes: `${SEED_TAG} · Toolbox talk with attached PDF notes`,
      formData: {
        toolbox_subject: talk.subject,
        comments_points_raised: `${SEED_TAG} · Crew reviewed controls and signed off.`,
        toolbox_pdf_url: talk.pdfUrl,
        related_swms: ["Working at Heights", "Excavation & Trenching"],
        seed_tag: SEED_TAG,
      },
      attendees: generalWorkers.map((worker) => ({
        worker_id: worker.id,
        worker_name: worker.fullName,
        present: true,
        signature_url: MOCK_SIGNATURE,
      })),
      submitterSignatureUrl: MOCK_SIGNATURE,
    });

    const result = await insertWithFormMetadataFallback(supabase, "site_forms", payload);
    if (!result.error) count += 1;
  }

  for (let index = 0; index < 3; index += 1) {
    const payload = buildSiteFormInsertPayload({
      formType: "daily_prestart",
      projectId: index % 2 === 0 ? projectOne.id : projectTwo.id,
      workerId: generalWorkers[index % generalWorkers.length]?.id ?? submitter.id,
      formDate: weekDates[index] ?? weekDates[0]!,
      formTime: "06:00:00",
      title: "Daily Pre-Start Meeting",
      status: "Completed",
      projectName: index % 2 === 0 ? projectOne.name : projectTwo.name,
      notes: `${SEED_TAG} · Daily pre-start with worker sign-offs`,
      formData: {
        client: "A Plus",
        scope_of_works: ["Earthworks", "Services"],
        significant_hazards: index === 2 ? ["Open excavation"] : ["Mobile plant interaction"],
        seed_tag: SEED_TAG,
      },
      attendees: generalWorkers.slice(0, 4).map((worker) => ({
        worker_id: worker.id,
        worker_name: worker.fullName,
        present: true,
        signature_url: MOCK_SIGNATURE,
      })),
      submitterSignatureUrl: MOCK_SIGNATURE,
    });
    payload.is_viewed = false;

    const result = await insertWithFormMetadataFallback(supabase, "site_forms", payload);
    if (!result.error) count += 1;
  }

  return count;
}

async function seedSwms(
  supabase: SupabaseClient,
  workers: SeedWorkerRecord[],
  projects: SeedProjectRecord[]
): Promise<{ documents: number; assignments: number }> {
  const project = projects[0]!;
  const today = formatIsoDate(new Date());
  const generalWorkers = workers.filter((row) => row.role === "general_worker");
  let documents = 0;
  let assignments = 0;

  const swmsDocs = [
    {
      title: "Working at Heights",
      fileUrl: "https://example.com/seed/test-data/swms-working-at-heights.pdf",
    },
    {
      title: "Excavation & Trenching",
      fileUrl: "https://example.com/seed/test-data/swms-excavation-trenching.pdf",
    },
  ];

  for (const doc of swmsDocs) {
    const swmsProjectId = /^[0-9a-f-]{36}$/i.test(project.id) ? project.id : null;
    const swmsId = randomUUID();
    const basePayload = {
      id: swmsId,
      title: doc.title,
      document_date: today,
      file_url: doc.fileUrl,
      doc_url: doc.fileUrl,
    };
    const extendedPayload = {
      ...basePayload,
      issue_date: today,
      status: "Active",
      is_archived: false,
      swms_scope: swmsProjectId ? "site_specific" : "company",
      project_id: swmsProjectId,
      version: "1.0",
    };

    const { data: existingDoc } = await supabase
      .from("swms_documents")
      .select("id")
      .eq("title", doc.title)
      .maybeSingle();

    let resolvedSwmsId = existingDoc?.id ? String(existingDoc.id) : null;

    if (resolvedSwmsId) {
      const { id: _ignoredId, ...updatePayload } = extendedPayload;
      await supabase.from("swms_documents").update(updatePayload).eq("id", resolvedSwmsId);
      await supabase.from("swms").upsert([{ ...basePayload, id: resolvedSwmsId }], { onConflict: "id" });
    } else {
      await insertWithVariants(supabase, "swms", [extendedPayload, basePayload]);
      const inserted = await insertWithVariants(supabase, "swms_documents", [extendedPayload, basePayload]);
      if (inserted.error) {
        console.warn(`SWMS document ${doc.title}: ${inserted.error}`);
        continue;
      }
      resolvedSwmsId = inserted.id ?? swmsId;
    }

    documents += 1;

    for (const [index, worker] of generalWorkers.slice(0, 4).entries()) {
      const token = `${SEED_TAG}-${doc.title.replace(/\W+/g, "-").toLowerCase()}-${worker.id.slice(0, 8)}-${index}`;
      const signed = index < 3;
      const assignmentVariants = [
        {
          swms_id: resolvedSwmsId,
          assignee_type: "worker",
          assignee_id: worker.id,
          assignee_name: worker.fullName,
          worker_id: worker.id,
          worker_name: worker.fullName,
          signing_token: token,
          token,
          status: signed ? "Signed" : "Pending",
          signature_url: signed ? MOCK_SIGNATURE : null,
          signed_at: signed ? isoDateTime(today, "08:15:00") : null,
        },
        {
          swms_id: resolvedSwmsId,
          assignee_type: "worker",
          assignee_id: worker.id,
          assignee_name: worker.fullName,
          worker_id: worker.id,
          signing_token: token,
          status: signed ? "Signed" : "Pending",
        },
      ];

      const { data: existingAssignment } = await supabase
        .from("swms_assignments")
        .select("id")
        .eq("swms_id", resolvedSwmsId)
        .eq("worker_id", worker.id)
        .maybeSingle();

      if (existingAssignment?.id) {
        for (const payload of assignmentVariants) {
          const { error } = await supabase
            .from("swms_assignments")
            .update(payload)
            .eq("id", existingAssignment.id);
          if (!error) break;
        }
        assignments += 1;
        continue;
      }

      const inserted = await insertWithVariants(supabase, "swms_assignments", assignmentVariants);
      if (inserted.error) {
        console.warn(`SWMS assignment ${doc.title} / ${worker.fullName}: ${inserted.error}`);
      } else {
        assignments += 1;
      }
    }
  }

  return { documents, assignments };
}

async function resolveInductionTemplateIds(
  supabase: SupabaseClient
): Promise<Array<{ id: string; title: string }>> {
  const seeds = loadStandardInductionTemplates();
  const resolved: Array<{ id: string; title: string }> = [];

  for (const seed of seeds) {
    const { data: byKey } = await supabase
      .from("induction_form_templates")
      .select("id, title")
      .eq("system_template_key", seed.system_template_key)
      .maybeSingle();

    if (byKey?.id) {
      resolved.push({ id: String(byKey.id), title: String(byKey.title ?? seed.title) });
      continue;
    }

    const { data: byId } = await supabase
      .from("induction_form_templates")
      .select("id, title")
      .eq("id", seed.id)
      .maybeSingle();

    if (byId?.id) {
      resolved.push({ id: String(byId.id), title: String(byId.title ?? seed.title) });
      continue;
    }

    const { data: byTitle } = await supabase
      .from("induction_form_templates")
      .select("id, title")
      .eq("title", seed.title)
      .maybeSingle();

    if (byTitle?.id) {
      resolved.push({ id: String(byTitle.id), title: String(byTitle.title ?? seed.title) });
    } else {
      console.warn(`Induction template not found: ${seed.title}`);
    }
  }

  return resolved;
}
async function seedInductionAssignments(
  supabase: SupabaseClient,
  workers: SeedWorkerRecord[],
  projects: SeedProjectRecord[]
): Promise<number> {
  const templates = await resolveInductionTemplateIds(supabase);
  if (templates.length === 0) {
    console.warn("No induction templates found — run npm run seed:inductions first.");
    return 0;
  }

  const generalWorkers = workers.filter((row) => row.role === "general_worker");
  let count = 0;

  for (const [templateIndex, template] of templates.entries()) {
    for (const [workerIndex, worker] of generalWorkers.entries()) {
      if ((templateIndex + workerIndex) % 3 === 2) continue;

      const completed = (templateIndex + workerIndex) % 2 === 0;
      const project = projects[workerIndex % projects.length]!;
      const payloadVariants = [
        {
          form_id: template.id,
          worker_id: worker.id,
          worker_name: worker.fullName,
          project_id: project.id,
          status: completed ? "completed" : "pending",
          assigned_at: isoDateTime(addDaysIso(formatIsoDate(new Date()), -7), "09:00:00"),
          completed_at: completed ? isoDateTime(formatIsoDate(new Date()), "10:30:00") : null,
          assigned_by: `${SEED_TAG}-admin`,
          responses: completed ? { seed: SEED_TAG } : {},
          signature_url: completed ? MOCK_SIGNATURE : null,
        },
        {
          form_id: template.id,
          worker_id: worker.id,
          worker_name: worker.fullName,
          project_id: project.id,
          status: completed ? "Completed" : "Pending",
          assigned_at: isoDateTime(addDaysIso(formatIsoDate(new Date()), -7), "09:00:00"),
        },
      ];

      const { data: existing } = await supabase
        .from("form_worker_assignments")
        .select("id")
        .eq("form_id", template.id)
        .eq("worker_id", worker.id)
        .maybeSingle();

      if (existing?.id) {
        for (const payload of payloadVariants) {
          const { error } = await supabase
            .from("form_worker_assignments")
            .update(payload)
            .eq("id", existing.id);
          if (!error) break;
        }
        count += 1;
        continue;
      }

      const inserted = await insertWithVariants(supabase, "form_worker_assignments", payloadVariants);
      if (inserted.error) {
        console.warn(
          `Induction assignment ${template.title} / ${worker.fullName}: ${inserted.error}`
        );
      } else {
        count += 1;
      }
    }
  }

  return count;
}

function lineId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function buildActivity(
  category: TimesheetLineCategory,
  startTime: string,
  endTime: string,
  durationMode: "full_day" | "partial" = "partial"
): TimesheetActivitySlot {
  return syncLineItemFields({
    id: lineId("activity"),
    category,
    durationMode,
    startTime,
    endTime,
    label: "",
  });
}

function buildTimesheetPayload(options: {
  workerId: string;
  workDate: string;
  projectId: string;
  projectName: string;
  trade: string;
  activities: TimesheetActivitySlot[];
  breaks?: TimesheetBreakSlot[];
  notes: string;
}): Record<string, unknown> {
  const breaks = options.breaks ?? [];
  const totals = calculateDailyTotalsFromSlots(options.activities, breaks);
  const now = new Date().toISOString();
  const first = options.activities[0];
  const last = options.activities[options.activities.length - 1];

  return {
    worker_id: options.workerId,
    work_date: options.workDate,
    project_id: options.projectId,
    project_name: options.projectName,
    worker_trade: options.trade,
    start_time: first?.startTime ?? "06:30",
    finish_time: last?.endTime ?? "15:00",
    break_minutes: Math.round(totals.breakHours * 60),
    work_hours: totals.workHours,
    break_hours: totals.breakHours,
    daily_total_hours: totals.dailyTotalHours,
    total_hours: totals.dailyTotalHours,
    activities: options.activities.map((row) => {
      const synced = syncLineItemFields(row);
      return {
        id: synced.id,
        start_time: synced.startTime,
        end_time: synced.endTime,
        label: synced.label,
        category: synced.category,
        duration_mode: synced.durationMode,
        hours: synced.hours,
      };
    }),
    breaks: breaks.map((row) => ({
      id: row.id,
      start_time: row.startTime,
      end_time: row.endTime,
    })),
    notes: `${options.notes} [${SEED_TAG}]`,
    signature_url: MOCK_SIGNATURE,
    is_draft: false,
    status: "pending",
    submitted_at: now,
    updated_at: now,
  };
}

async function seedTimesheets(
  supabase: SupabaseClient,
  workers: SeedWorkerRecord[],
  projects: SeedProjectRecord[]
): Promise<number> {
  const weekDates = getSeedWeekDates().slice(0, 5);
  const generalWorkers = workers.filter(
    (row) => row.role === "general_worker" && row.state === "NSW"
  );
  let count = 0;

  const shiftPatterns = [
    { start: "06:00", end: "14:30" },
    { start: "06:30", end: "15:00" },
    { start: "07:00", end: "15:30", break: { startTime: "12:00", endTime: "12:30" } },
    { start: "06:30", end: "16:30" },
    { start: "07:30", end: "16:00" },
  ];

  for (const worker of generalWorkers) {
    for (const [dayIndex, workDate] of weekDates.entries()) {
      const project = projects[dayIndex % 2 === 0 ? 0 : 1] ?? projects[0]!;
      const pattern = shiftPatterns[(dayIndex + generalWorkers.indexOf(worker)) % shiftPatterns.length]!;
      const breakSlot = pattern.break
        ? { id: lineId("break"), startTime: pattern.break.startTime, endTime: pattern.break.endTime }
        : undefined;

      const payload = buildTimesheetPayload({
        workerId: worker.id,
        workDate,
        projectId: project.id,
        projectName: project.name,
        trade: worker.trade,
        activities: [buildActivity("work", pattern.start, pattern.end)],
        breaks: breakSlot ? [breakSlot] : [],
        notes: `${worker.fullName} · ${workDate} shift`,
      });

      const { data: existing } = await supabase
        .from("worker_timesheets")
        .select("id")
        .eq("worker_id", worker.id)
        .eq("work_date", workDate)
        .maybeSingle();

      if (existing?.id) {
        await supabase.from("worker_timesheets").update(payload).eq("id", existing.id);
        count += 1;
        continue;
      }

      const inserted = await insertWithVariants(supabase, "worker_timesheets", [payload]);
      if (!inserted.error) count += 1;
    }
  }

  return count;
}

type RegionalTimesheetDayKind = "work" | "sick_leave" | "public_holiday";

interface RegionalTimesheetDaySpec {
  kind: RegionalTimesheetDayKind;
  hours?: 8 | 10;
}

function buildRegionalTimesheetDay(
  worker: SeedWorkerRecord,
  project: SeedProjectRecord,
  workDate: string,
  daySpec: RegionalTimesheetDaySpec
): Record<string, unknown> {
  const actBreak = { id: lineId("break"), startTime: "12:00", endTime: "12:30" };

  if (daySpec.kind === "sick_leave") {
    return buildTimesheetPayload({
      workerId: worker.id,
      workDate,
      projectId: project.id,
      projectName: project.name,
      trade: worker.trade,
      activities: [buildActivity("sick_leave", "06:30", "14:30", "full_day")],
      breaks: [],
      notes: `${worker.fullName} · ${workDate} · Sick leave day`,
    });
  }

  if (daySpec.kind === "public_holiday") {
    return buildTimesheetPayload({
      workerId: worker.id,
      workDate,
      projectId: project.id,
      projectName: project.name,
      trade: worker.trade,
      activities: [buildActivity("public_holiday", "06:30", "14:30", "full_day")],
      breaks: [],
      notes: `${worker.fullName} · ${workDate} · Public holiday`,
    });
  }

  const hours = daySpec.hours ?? 8;
  const endTime = hours === 10 ? "16:30" : "14:30";
  const breaks = worker.state === "ACT" ? [actBreak] : hours === 10 ? [actBreak] : [];

  return buildTimesheetPayload({
    workerId: worker.id,
    workDate,
    projectId: project.id,
    projectName: project.name,
    trade: worker.trade,
    activities: [buildActivity("work", "06:30", endTime)],
    breaks,
    notes: `${worker.fullName} · ${workDate} · ${hours.toFixed(1)} hr worked shift`,
  });
}

async function upsertTimesheetRow(
  supabase: SupabaseClient,
  workerId: string,
  workDate: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  const { data: existing } = await supabase
    .from("worker_timesheets")
    .select("id")
    .eq("worker_id", workerId)
    .eq("work_date", workDate)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from("worker_timesheets")
      .update(payload)
      .eq("id", existing.id);
    return !error;
  }

  const inserted = await insertWithVariants(supabase, "worker_timesheets", [payload]);
  return !inserted.error;
}

async function seedRegionalTimesheets(
  supabase: SupabaseClient,
  actWorkers: SeedWorkerRecord[],
  waWorkers: SeedWorkerRecord[],
  actProject: SeedProjectRecord,
  waProject: SeedProjectRecord
): Promise<number> {
  const weekDates = getSeedWeekDates().slice(0, 5);
  let count = 0;

  const actWeekPlans: RegionalTimesheetDaySpec[][] = [
    [
      { kind: "work", hours: 8 },
      { kind: "work", hours: 10 },
      { kind: "work", hours: 8 },
      { kind: "sick_leave" },
      { kind: "work", hours: 10 },
    ],
    [
      { kind: "work", hours: 8 },
      { kind: "public_holiday" },
      { kind: "work", hours: 10 },
      { kind: "work", hours: 8 },
      { kind: "work", hours: 8 },
    ],
  ];

  const waWeekPlans: RegionalTimesheetDaySpec[][] = [
    [
      { kind: "work", hours: 10 },
      { kind: "work", hours: 8 },
      { kind: "sick_leave" },
      { kind: "work", hours: 10 },
      { kind: "work", hours: 8 },
    ],
    [
      { kind: "public_holiday" },
      { kind: "work", hours: 8 },
      { kind: "work", hours: 10 },
      { kind: "work", hours: 8 },
      { kind: "work", hours: 10 },
    ],
  ];

  for (const [workerIndex, worker] of actWorkers.entries()) {
    const plan = actWeekPlans[workerIndex] ?? actWeekPlans[0]!;
    for (const [dayIndex, workDate] of weekDates.entries()) {
      const daySpec = plan[dayIndex] ?? { kind: "work", hours: 8 };
      const payload = buildRegionalTimesheetDay(worker, actProject, workDate, daySpec);
      if (await upsertTimesheetRow(supabase, worker.id, workDate, payload)) {
        count += 1;
      }
    }
  }

  for (const [workerIndex, worker] of waWorkers.entries()) {
    const plan = waWeekPlans[workerIndex] ?? waWeekPlans[0]!;
    for (const [dayIndex, workDate] of weekDates.entries()) {
      const daySpec = plan[dayIndex] ?? { kind: "work", hours: 8 };
      const payload = buildRegionalTimesheetDay(worker, waProject, workDate, daySpec);
      if (await upsertTimesheetRow(supabase, worker.id, workDate, payload)) {
        count += 1;
      }
    }
  }

  return count;
}

async function seedLeaveRequests(
  supabase: SupabaseClient,
  workers: SeedWorkerRecord[],
  projects: SeedProjectRecord[]
): Promise<number> {
  const generalWorkers = workers.filter((row) => row.role === "general_worker");
  const weekDates = getSeedWeekDates();
  const requests = [
    {
      worker: generalWorkers[0]!,
      project: projects[0]!,
      date: weekDates[2]!,
      status: "pending",
      leaveType: "Annual Leave",
      reason: `${SEED_TAG} · Annual leave request — family travel`,
    },
    {
      worker: generalWorkers[1]!,
      project: projects[0]!,
      date: weekDates[3]!,
      status: "pending",
      leaveType: "Personal Leave",
      reason: `${SEED_TAG} · Sick leave — medical appointment`,
    },
    {
      worker: generalWorkers[2]!,
      project: projects[1] ?? projects[0]!,
      date: weekDates[1]!,
      status: "approved",
      leaveType: "Annual Leave",
      reason: `${SEED_TAG} · Approved annual leave`,
    },
    {
      worker: generalWorkers[3]!,
      project: projects[1] ?? projects[0]!,
      date: weekDates[4]!,
      status: "declined",
      leaveType: "Personal Leave",
      reason: `${SEED_TAG} · Rejected sick leave — insufficient notice`,
    },
  ];

  let count = 0;

  for (const request of requests) {
    const payloadVariants = [
      {
        worker_id: request.worker.id,
        worker_name: request.worker.fullName,
        project_id: request.project.id,
        first_date: request.date,
        last_date: request.date,
        number_of_days: 1,
        reason: request.reason,
        signature_url: MOCK_SIGNATURE,
        status: request.status,
        leave_type: request.leaveType,
      },
      {
        worker_id: request.worker.id,
        project_id: request.project.id,
        first_date: request.date,
        last_date: request.date,
        number_of_days: 1,
        reason: request.reason,
        status: request.status,
      },
    ];

    const { data: existing } = await supabase
      .from("leave_requests")
      .select("id")
      .eq("worker_id", request.worker.id)
      .eq("first_date", request.date)
      .ilike("reason", `%${SEED_TAG}%`)
      .maybeSingle();

    if (existing?.id) {
      await supabase.from("leave_requests").update(payloadVariants[0]!).eq("id", existing.id);
      count += 1;
      continue;
    }

    const inserted = await insertWithVariants(supabase, "leave_requests", payloadVariants);
    if (!inserted.error) count += 1;
  }

  return count;
}

async function upsertProjectWorkerAssignments(
  supabase: SupabaseClient,
  project: SeedProjectRecord,
  workers: SeedWorkerRecord[]
): Promise<void> {
  for (const worker of workers) {
    await supabase.from("project_worker_assignments").upsert(
      [
        {
          project_id: project.id,
          worker_id: worker.id,
          worker_name: worker.fullName,
          project_name: project.name,
          status: "Active",
        },
      ],
      { onConflict: "project_id,worker_id", ignoreDuplicates: true }
    );

    await supabase
      .from("workers")
      .update({
        assigned_project_id: project.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", worker.id);
  }
}

export async function cleanupComprehensiveTestSeed(supabase: SupabaseClient): Promise<void> {
  const unitNumbers = PLANT_SPECS.map((row) => row.unitNumber);

  const { data: workerRows } = await supabase
    .from("workers")
    .select("id")
    .or(`email.ilike.%@${SEED_EMAIL_DOMAIN},notes.ilike.%${SEED_TAG}%`);
  const workerIds = (workerRows ?? []).map((row) => String(row.id));

  const { data: plantRows } = await supabase
    .from("plant")
    .select("id")
    .in("unit_number", unitNumbers);
  const plantIds = (plantRows ?? []).map((row) => String(row.id));

  if (workerIds.length > 0) {
    await supabase.from("form_worker_assignments").delete().in("worker_id", workerIds);
    await supabase.from("worker_timesheets").delete().in("worker_id", workerIds);
    await supabase.from("leave_requests").delete().in("worker_id", workerIds);
    await supabase.from("worker_schedule").delete().in("worker_id", workerIds);
    await supabase.from("worker_calendar_events").delete().in("worker_id", workerIds);
    await supabase.from("project_worker_assignments").delete().in("worker_id", workerIds);
    await supabase.from("swms_assignments").delete().in("worker_id", workerIds);
    await supabase.from("site_forms").delete().in("worker_id", workerIds);
  }

  await supabase.from("site_forms").delete().contains("form_data", { seed_tag: SEED_TAG });
  await supabase.from("leave_requests").delete().ilike("reason", `%${SEED_TAG}%`);
  await supabase.from("plant_service_schedules").delete().ilike("notes", `%${SEED_TAG}%`);

  if (plantIds.length > 0) {
    await supabase.from("plant_prestarts").delete().in("plant_id", plantIds);
    await supabase.from("project_plant_assignments").delete().in("plant_id", plantIds);
  }

  await supabase.from("plant_equipment").delete().in("unit_number", unitNumbers);
  if (plantIds.length > 0) {
    await supabase.from("plant").delete().in("id", plantIds);
  }

  const swmsTitles = ["Working at Heights", "Excavation & Trenching"];
  const { data: swmsRows } = await supabase.from("swms_documents").select("id").in("title", swmsTitles);
  const swmsIds = (swmsRows ?? []).map((row) => String(row.id));
  if (swmsIds.length > 0) {
    await supabase.from("swms_assignments").delete().in("swms_id", swmsIds);
    await supabase.from("swms_documents").delete().in("id", swmsIds);
  }

  if (workerIds.length > 0) {
    await supabase.from("workers").delete().in("id", workerIds);
  }
}

export async function runComprehensiveTestSeed(options: {
  supabase: SupabaseClient;
  admin?: SupabaseClient | null;
  cleanup?: boolean;
}): Promise<ComprehensiveSeedSummary> {
  if (options.cleanup) {
    await cleanupComprehensiveTestSeed(options.supabase);
    return {
      workers: 0,
      projects: 0,
      plant: 0,
      plantPrestarts: 0,
      siteForms: 0,
      swmsDocuments: 0,
      swmsAssignments: 0,
      inductionAssignments: 0,
      timesheets: 0,
      leaveRequests: 0,
      actWorkers: 0,
      waWorkers: 0,
      regionalTimesheets: 0,
    };
  }

  const admin = options.admin ?? null;
  const workers: SeedWorkerRecord[] = [];

  if (admin) {
    try {
      const master = await runMasterAdminSeed({ supabase: options.supabase });
      workers.push({
        id: master.workerId,
        firstName: MASTER_ADMIN_FIRST_NAME,
        lastName: MASTER_ADMIN_LAST_NAME,
        fullName: MASTER_ADMIN_FULL_NAME,
        email: master.email,
        role: "owner",
        trade: "Director",
        state: "NSW",
        phone: "0412 000001",
        emergencyContact: "SiteBolt Emergency · 0400 000 001",
      });
      console.log(`Primary owner seeded: ${master.email} (${MASTER_ADMIN_ROLE})`);
    } catch (error) {
      console.warn(
        "Primary owner seed skipped:",
        error instanceof Error ? error.message : error
      );
    }
  }

  for (const spec of ROLE_USER_SPECS) {
    workers.push(
      await upsertSeedWorker(options.supabase, admin, {
        firstName: spec.firstName,
        lastName: spec.lastName,
        email: seedEmail(`${spec.key}.user`),
        role: spec.role,
        trade: spec.trade,
        state: "NSW",
        phone: `0412 ${String(100000 + workers.length).slice(-6)}`,
        emergencyContact: `Emergency Contact ${spec.lastName} · 0400 ${String(200000 + workers.length).slice(-6)}`,
      })
    );
  }

  for (const spec of GENERAL_WORKER_SPECS) {
    workers.push(
      await upsertSeedWorker(options.supabase, admin, {
        firstName: spec.firstName,
        lastName: spec.lastName,
        email: seedEmail(`${spec.key}.${spec.firstName.toLowerCase()}`),
        role: "general_worker",
        trade: spec.trade,
        state: spec.state ?? "NSW",
        phone: `0413 ${String(300000 + workers.length).slice(-6)}`,
        emergencyContact: `Emergency Contact ${spec.lastName} · 0401 ${String(400000 + workers.length).slice(-6)}`,
      })
    );
  }

  const actWorkers: SeedWorkerRecord[] = [];
  for (const spec of ACT_WORKER_SPECS) {
    actWorkers.push(
      await upsertSeedWorker(options.supabase, admin, {
        firstName: spec.firstName,
        lastName: spec.lastName,
        email: seedEmail(`${spec.key}.${spec.firstName.toLowerCase()}`),
        role: "general_worker",
        trade: spec.trade,
        state: "ACT",
        crew: spec.crew,
        phone: `0426 ${String(500000 + actWorkers.length).slice(-6)}`,
        emergencyContact: `ACT Emergency · 0402 ${String(600000 + actWorkers.length).slice(-6)}`,
      })
    );
  }

  const waWorkers: SeedWorkerRecord[] = [];
  for (const spec of WA_WORKER_SPECS) {
    waWorkers.push(
      await upsertSeedWorker(options.supabase, admin, {
        firstName: spec.firstName,
        lastName: spec.lastName,
        email: seedEmail(`${spec.key}.${spec.firstName.toLowerCase()}`),
        role: "general_worker",
        trade: spec.trade,
        state: "WA",
        crew: spec.crew,
        phone: `0427 ${String(700000 + waWorkers.length).slice(-6)}`,
        emergencyContact: `WA Emergency · 0403 ${String(800000 + waWorkers.length).slice(-6)}`,
      })
    );
  }

  workers.push(...actWorkers, ...waWorkers);

  const projectManager =
    workers.find((row) => row.role === "project_super_admin") ?? workers[0]!;
  const projectAdmin = workers.find((row) => row.role === "project_admin") ?? workers[0]!;
  const generalWorkers = workers.filter((row) => row.role === "general_worker");

  const projectOneWorkers = generalWorkers.slice(0, 3).map((row) => row.id);
  const projectTwoWorkers = generalWorkers.slice(3, 5).map((row) => row.id);

  const projects = await ensureSeedProjects(options.supabase, projectManager.id, projectAdmin.id, {
    [PROJECT_SPECS[0]!.slug]: projectOneWorkers,
    [PROJECT_SPECS[1]!.slug]: projectTwoWorkers,
    [PROJECT_SPECS[2]!.slug]: actWorkers.map((row) => row.id),
    [PROJECT_SPECS[3]!.slug]: waWorkers.map((row) => row.id),
  });

  const actProject =
    projects.find((row) => row.slug === PROJECT_SPECS[2]!.slug) ?? projects[0]!;
  const waProject =
    projects.find((row) => row.slug === PROJECT_SPECS[3]!.slug) ?? projects[1] ?? projects[0]!;

  await upsertProjectWorkerAssignments(options.supabase, projects[0]!, generalWorkers.slice(0, 3));
  await upsertProjectWorkerAssignments(
    options.supabase,
    projects[1] ?? projects[0]!,
    generalWorkers.slice(3, 5)
  );
  await upsertProjectWorkerAssignments(options.supabase, actProject, actWorkers);
  await upsertProjectWorkerAssignments(options.supabase, waProject, waWorkers);

  const plants: SeedPlantRecord[] = [];
  for (let index = 0; index < PLANT_SPECS.length; index += 1) {
    const spec = PLANT_SPECS[index]!;
    const project = projects[index % projects.length]!;
    plants.push(await upsertSeedPlant(options.supabase, spec, project, index));
  }

  const plantPrestarts = await seedPlantPrestarts(options.supabase, plants, workers, projects);
  const siteForms = await seedSafetyAndMeetings(options.supabase, workers, projects);
  const swms = await seedSwms(options.supabase, workers, projects);
  const inductionAssignments = await seedInductionAssignments(options.supabase, workers, projects);
  const timesheets = await seedTimesheets(options.supabase, workers, projects);
  const regionalTimesheets = await seedRegionalTimesheets(
    options.supabase,
    actWorkers,
    waWorkers,
    actProject,
    waProject
  );
  const leaveRequests = await seedLeaveRequests(options.supabase, workers, projects);

  return {
    workers: workers.length,
    projects: projects.length,
    plant: plants.length,
    plantPrestarts,
    siteForms,
    swmsDocuments: swms.documents,
    swmsAssignments: swms.assignments,
    inductionAssignments,
    timesheets,
    leaveRequests,
    actWorkers: actWorkers.length,
    waWorkers: waWorkers.length,
    regionalTimesheets,
  };
}
