/**
 * Dashboard & calendar test data seed.
 *
 * Usage:
 *   npm run seed:dashboard-calendars
 *   npm run seed:dashboard-calendars -- --cleanup
 *
 * Populates plant register, plant/worker calendars, site forms, SWMS,
 * VOCs, leave, and project dashboard metrics. Does NOT touch ITC / ITP data.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { loadEnvLocal, getSupabaseEnv } from "../e2e/helpers/env";
import { buildSiteFormInsertPayload } from "../src/lib/site-form-payload";
import { buildSubcontractorPlantPayload } from "../src/lib/subcontractor-plant-payload";
import { insertWithFormMetadataFallback } from "../src/lib/form-metadata-consolidation";
import type { SiteFormType } from "../src/lib/site-forms";
import type { PrestartTemplate } from "../src/lib/prestart-templates";

loadEnvLocal();

export const SEED_TAG = "DASHBOARD-CALENDAR-SEED";
const PLANT_UNIT_PREFIX = "SEED-";
const PAYROLL_EMAIL_DOMAIN = "payroll-test.sitebolt.local";
const SEED_EMAIL_DOMAIN = "dashboard-calendar.sitebolt.local";

interface SeedWorker {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
}

interface SeedProject {
  id: string;
  name: string;
}

interface SeedPlant {
  id: string;
  unitNumber: string;
  displayName: string;
  template: PrestartTemplate;
}

interface SeedPlantSpec {
  unitNumber: string;
  displayName: string;
  category: string;
  make: string;
  model: string;
  serialNumber: string;
  registrationCode: string;
  template: PrestartTemplate;
  currentHours: number;
  nextServiceHours: number;
  lastServiceDate: string;
  serviceIntervalHours: number;
}

const PLANT_SPECS: SeedPlantSpec[] = [
  {
    unitNumber: `${PLANT_UNIT_PREFIX}CAT320`,
    displayName: "Cat 320 Excavator 20t",
    category: "Excavator",
    make: "Caterpillar",
    model: "320",
    serialNumber: "CAT320VN482019",
    registrationCode: "PLT-320",
    template: "excavator",
    currentHours: 4820,
    nextServiceHours: 5000,
    lastServiceDate: "2026-07-18",
    serviceIntervalHours: 250,
  },
  {
    unitNumber: `${PLANT_UNIT_PREFIX}KX057`,
    displayName: "Kubota KX057-4 Mini Digger",
    category: "Excavator",
    make: "Kubota",
    model: "KX057-4",
    serialNumber: "KUB0574MN11842",
    registrationCode: "PLT-MINI",
    template: "excavator",
    currentHours: 1180,
    nextServiceHours: 1250,
    lastServiceDate: "2026-07-25",
    serviceIntervalHours: 250,
  },
  {
    unitNumber: `${PLANT_UNIT_PREFIX}H11I`,
    displayName: "Hamm H11i Roller",
    category: "Roller",
    make: "Hamm",
    model: "H11i",
    serialNumber: "HMM11I2024012",
    registrationCode: "PLT-ROLL",
    template: "roller",
    currentHours: 860,
    nextServiceHours: 1000,
    lastServiceDate: "2026-06-30",
    serviceIntervalHours: 250,
  },
  {
    unitNumber: `${PLANT_UNIT_PREFIX}JCB540`,
    displayName: "JCB 540-170 Telehandler",
    category: "Telehandler",
    make: "JCB",
    model: "540-170",
    serialNumber: "JCB540170TH884",
    registrationCode: "PLT-TH",
    template: "loader",
    currentHours: 2140,
    nextServiceHours: 2250,
    lastServiceDate: "2026-08-01",
    serviceIntervalHours: 250,
  },
  {
    unitNumber: `${PLANT_UNIT_PREFIX}CA2500`,
    displayName: "Dynapac CA2500D",
    category: "Roller",
    make: "Dynapac",
    model: "CA2500D",
    serialNumber: "DYNCA2500D5591",
    registrationCode: "PLT-COMP",
    template: "roller",
    currentHours: 1560,
    nextServiceHours: 1750,
    lastServiceDate: "2026-07-10",
    serviceIntervalHours: 250,
  },
  {
    unitNumber: `${PLANT_UNIT_PREFIX}VOLA30`,
    displayName: "Volvo A30G Articulated Dump Truck",
    category: "Truck",
    make: "Volvo",
    model: "A30G",
    serialNumber: "VOLA30GTRK3310",
    registrationCode: "PLT-ADT",
    template: "truck",
    currentHours: 3920,
    nextServiceHours: 4000,
    lastServiceDate: "2026-07-22",
    serviceIntervalHours: 500,
  },
];

const FALLBACK_WORKERS = [
  { firstName: "Alex", lastName: "Nguyen", email: `alex.nguyen@${SEED_EMAIL_DOMAIN}` },
  { firstName: "Emma", lastName: "Wilson", email: `emma.wilson@${SEED_EMAIL_DOMAIN}` },
  { firstName: "Chris", lastName: "Patel", email: `chris.patel@${SEED_EMAIL_DOMAIN}` },
  { firstName: "Mia", lastName: "Brown", email: `mia.brown@${SEED_EMAIL_DOMAIN}` },
];

function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Current Mon–Sun week. */
export function getCurrentWeekDates(reference = new Date()): string[] {
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

export function getNextWeekDates(reference = new Date()): string[] {
  const current = getCurrentWeekDates(reference);
  const monday = new Date(`${current[0]}T12:00:00`);
  monday.setDate(monday.getDate() + 7);
  return getCurrentWeekDates(monday);
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

      if (!error) {
        return { id: data?.id ? String(data.id) : null, error: null };
      }

      lastError = error.message;
      const missing = parseMissingColumn(error.message);
      if (!missing || !(missing in payload)) break;
      const { [missing]: _removed, ...rest } = payload;
      payload = rest;
    }
  }

  return { id: null, error: lastError ?? `Could not insert into ${table}.` };
}

function parseMissingColumn(message: string): string | null {
  const lower = message.toLowerCase();
  const patterns = [
    /could not find the '([^']+)' column/,
    /column "([^"]+)" of relation/,
    /'([^']+)' column of '[^']+' in the schema cache/,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern) ?? lower.match(pattern);
    if (match?.[1]) return match[1];
  }

  if (lower.includes("schema cache")) {
    const cacheMatch = message.match(/'([^']+)'/);
    if (cacheMatch?.[1]) return cacheMatch[1];
  }

  return null;
}

async function resolveProjects(supabase: SupabaseClient): Promise<SeedProject[]> {
  const { fetchProjects } = await import("../src/lib/project-resolver");
  const projects = await fetchProjects();
  if (projects.length === 0) {
    throw new Error("No projects found. Add at least one active project before seeding.");
  }

  const primary = projects[0]!;
  const secondary = projects[1] ?? projects[0]!;

  return [
    { id: primary.id, name: primary.name },
    { id: secondary.id, name: secondary.name },
  ];
}

async function resolveWorkers(supabase: SupabaseClient): Promise<SeedWorker[]> {
  const { data: payrollRows } = await supabase
    .from("workers")
    .select("id,first_name,last_name,full_name,email")
    .ilike("email", `%@${PAYROLL_EMAIL_DOMAIN}`);

  const workers: SeedWorker[] = (payrollRows ?? []).map((row) => ({
    id: String(row.id),
    firstName: String(row.first_name ?? ""),
    lastName: String(row.last_name ?? ""),
    fullName: String(row.full_name ?? `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim()),
    email: String(row.email ?? ""),
  }));

  if (workers.length >= 3) return workers.slice(0, 4);

  for (const spec of FALLBACK_WORKERS) {
    if (workers.length >= 4) break;

    const { data: existing } = await supabase
      .from("workers")
      .select("id,first_name,last_name,full_name,email")
      .eq("email", spec.email)
      .maybeSingle();

    if (existing?.id) {
      workers.push({
        id: String(existing.id),
        firstName: String(existing.first_name ?? spec.firstName),
        lastName: String(existing.last_name ?? spec.lastName),
        fullName: String(existing.full_name ?? `${spec.firstName} ${spec.lastName}`),
        email: spec.email,
      });
      continue;
    }

    const payloadVariants = [
      {
        first_name: spec.firstName,
        last_name: spec.lastName,
        full_name: `${spec.firstName} ${spec.lastName}`,
        email: spec.email,
        status: "active",
        state: "NSW",
        trade: "Labourer",
        security_role: "general_worker",
        notes: SEED_TAG,
      },
      {
        first_name: spec.firstName,
        last_name: spec.lastName,
        full_name: `${spec.firstName} ${spec.lastName}`,
        email: spec.email,
        status: "active",
      },
    ];

    const inserted = await insertWithVariants(supabase, "workers", payloadVariants);
    if (inserted.id) {
      workers.push({
        id: inserted.id,
        firstName: spec.firstName,
        lastName: spec.lastName,
        fullName: `${spec.firstName} ${spec.lastName}`,
        email: spec.email,
      });
    }
  }

  if (workers.length === 0) {
    throw new Error("No workers available for seeding. Run payroll seed or add workers first.");
  }

  return workers;
}

async function upsertSeedPlant(
  supabase: SupabaseClient,
  spec: SeedPlantSpec,
  project: SeedProject,
  projectIndex: number
): Promise<SeedPlant> {
  const status = projectIndex % 2 === 0 ? "allocated" : "available";
  const assignedProjectId = project.id;

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
      assigned_project_id: assignedProjectId,
      assigned_project_name: project.name,
      project_id: assignedProjectId,
      project_name: project.name,
      service_contact_name: "Site Services Team",
      service_contact_phone: "0412 345 678",
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
      assigned_project_id: assignedProjectId,
      assigned_project_name: project.name,
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
      if (!String(error.message).includes("schema cache")) {
        throw new Error(`Update plant ${spec.unitNumber}: ${error.message}`);
      }
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
    assignedProjectId,
    notes: `${SEED_TAG} · service interval ${spec.serviceIntervalHours}hr`,
    serviceHistoryDocUrl: "https://example.com/seed/service-history.pdf",
    plantRiskAssessmentDocUrl: "https://example.com/seed/plant-risk-assessment.pdf",
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
        project_id: assignedProjectId,
        plant_id: plantId,
        plant_name: spec.displayName,
        project_name: project.name,
        status: "Assigned",
      },
    ],
    { onConflict: "project_id,plant_id", ignoreDuplicates: true }
  );

  return {
    id: plantId,
    unitNumber: spec.unitNumber,
    displayName: spec.displayName,
    template: spec.template,
  };
}

async function seedPlantServices(
  supabase: SupabaseClient,
  plants: SeedPlant[],
  weekDates: string[],
  nextWeekDates: string[]
): Promise<number> {
  let count = 0;
  const serviceDates = [
    weekDates[1],
    weekDates[3],
    weekDates[4],
    nextWeekDates[0],
    nextWeekDates[2],
    nextWeekDates[4],
  ].filter(Boolean) as string[];

  const serviceTypes = [
    "250hr Service",
    "500hr Major Service",
    "Pre-Start Inspection",
    "Tyre Replacement",
    "Hydraulic Filter Change",
    "Annual Compliance Inspection",
  ];

  for (let index = 0; index < plants.length; index += 1) {
    const plant = plants[index]!;
    const date = serviceDates[index % serviceDates.length]!;
    const serviceType = serviceTypes[index % serviceTypes.length]!;

    const payloadVariants = [
      {
        plant_id: plant.id,
        unit_number: plant.unitNumber,
        plant_name: plant.displayName,
        scheduled_date: date,
        service_date: date,
        service_type: serviceType,
        service_hours: 5000,
        status: "Scheduled",
        completed: false,
        notes: `${SEED_TAG} · ${serviceType}`,
        technician_notes: `${SEED_TAG} · Booked via seed script`,
      },
      {
        plant_id: plant.id,
        scheduled_date: date,
        service_type: serviceType,
        completed: false,
        notes: `${SEED_TAG} · ${serviceType}`,
      },
      {
        unit_number: plant.unitNumber,
        plant_name: plant.displayName,
        scheduled_date: date,
        service_type: serviceType,
        completed: false,
        notes: `${SEED_TAG} · ${serviceType}`,
      },
    ];

    const inserted = await insertWithVariants(supabase, "plant_service_schedules", payloadVariants);
    if (inserted.error) {
      console.warn(`Plant service for ${plant.unitNumber}: ${inserted.error}`);
    } else {
      count += 1;
    }
  }

  return count;
}

function buildPrestartCheckData(template: PrestartTemplate, hours: number, nextService: number) {
  const base: Record<string, unknown> = {
    ownership: "A Plus",
    hours,
    next_service: nextService,
    engine_oil: "OK",
    coolant: "OK",
    seat_belt: "OK",
    hazard_light: "OK",
    tag: SEED_TAG,
  };

  if (template === "excavator") {
    return {
      ...base,
      hydraulic_oil: "OK",
      fuel_pct: 75,
      tracks_tension: "OK",
      motion_beacon: "OK",
    };
  }

  if (template === "roller") {
    return {
      ...base,
      vibration_system: "OK",
      drum_condition: "OK",
      water_spray: "OK",
    };
  }

  if (template === "truck") {
    return {
      ...base,
      kms: hours * 2,
      next_service_kms: nextService * 2,
      tyres: "OK",
      brakes: "OK",
    };
  }

  return {
    ...base,
    hydraulic_oil: "OK",
    tyres: "OK",
    forks: "OK",
  };
}

async function seedPlantPrestarts(
  supabase: SupabaseClient,
  plants: SeedPlant[],
  plantSpecs: SeedPlantSpec[],
  workers: SeedWorker[],
  projects: SeedProject[],
  weekDates: string[]
): Promise<number> {
  let count = 0;
  const today = formatIsoDate(new Date());
  const prestartDates = [weekDates[0], weekDates[1], weekDates[2], weekDates[3], today].filter(
    Boolean
  ) as string[];

  for (let index = 0; index < plants.length; index += 1) {
    const plant = plants[index]!;
    const spec = plantSpecs[index]!;
    const worker = workers[index % workers.length]!;
    const project = projects[index % projects.length]!;
    const hasDefect = index === 0;
    const resolvedDefect = index === 1;

    for (const [dateIndex, formDate] of prestartDates.entries()) {
      if (dateIndex > 1 && index > 3) continue;

      const payload = {
        plant_id: plant.id,
        operator_name: worker.fullName,
        operator_worker_id: worker.id,
        project_id: project.id,
        site_id: project.id,
        current_reading: spec.currentHours + dateIndex * 8,
        next_service_due: spec.nextServiceHours,
        check_data: buildPrestartCheckData(spec.template, spec.currentHours, spec.nextServiceHours),
        has_defect: hasDefect && dateIndex === prestartDates.length - 1,
        defect_summary: hasDefect && dateIndex === prestartDates.length - 1 ? "Hydraulic leak noted" : null,
        defect_comments:
          hasDefect && dateIndex === prestartDates.length - 1
            ? `${SEED_TAG} · Minor hydraulic hose seepage — monitor daily`
            : resolvedDefect && dateIndex === 0
              ? `${SEED_TAG} · Previous defect resolved`
              : null,
        defect_status:
          resolvedDefect && dateIndex === 0
            ? "resolved"
            : hasDefect && dateIndex === prestartDates.length - 1
              ? "open"
              : null,
        defect_resolved_at: resolvedDefect && dateIndex === 0 ? isoDateTime(formDate, "14:00:00") : null,
        defect_photo_url:
          hasDefect && dateIndex === prestartDates.length - 1
            ? "https://example.com/seed/defect-photo.jpg"
            : null,
        signature_url: "https://example.com/seed/prestart-signature.png",
        submitted_at: isoDateTime(formDate, "05:45:00"),
        created_at: isoDateTime(formDate, "05:45:00"),
      };

      const result = await insertWithFormMetadataFallback(supabase, "plant_prestarts", payload);
      if (result.error) {
        console.warn(`Plant prestart ${plant.unitNumber} ${formDate}: ${result.error}`);
      } else {
        count += 1;
      }
    }
  }

  return count;
}

async function seedWorkerSchedulesAndEvents(
  supabase: SupabaseClient,
  workers: SeedWorker[],
  projects: SeedProject[],
  weekDates: string[]
): Promise<{ schedules: number; events: number; leaveRequests: number }> {
  let schedules = 0;
  let events = 0;
  let leaveRequests = 0;

  const [mon, tue, wed, thu, fri, sat, sun] = weekDates;
  const primary = projects[0]!;
  const secondary = projects[1] ?? projects[0]!;

  for (let index = 0; index < workers.length; index += 1) {
    const worker = workers[index]!;
    const dayProject = index % 2 === 0 ? primary : secondary;

    const dayShiftDates = [mon, tue, wed, thu, fri].filter(Boolean) as string[];
    for (const day of dayShiftDates) {
      if ((index + dayShiftDates.indexOf(day)) % 3 === 0 && index > 0) continue;

      const schedulePayload = {
        worker_id: worker.id,
        project_id: dayProject.id,
        project_name: dayProject.name,
        start_date: day,
        end_date: day,
        role_on_site: `${SEED_TAG}|Day Shift`,
        schedule_kind: "assignment",
      };

      const scheduleVariants = [
        schedulePayload,
        {
          worker_id: worker.id,
          project_id: dayProject.id,
          project_name: dayProject.name,
          start_date: day,
          end_date: day,
          role_on_site: "Day Shift",
        },
      ];

      const inserted = await insertWithVariants(supabase, "worker_schedule", scheduleVariants);
      if (inserted.error) {
        console.warn(`Worker schedule ${worker.fullName} ${day}: ${inserted.error}`);
      } else {
        schedules += 1;
      }
    }

    if (index === 0 && thu) {
      const nightPayload = {
        worker_id: worker.id,
        project_id: secondary.id,
        project_name: secondary.name,
        start_date: thu,
        end_date: thu,
        role_on_site: `${SEED_TAG}|Night Shift`,
        schedule_kind: "assignment",
      };
      const inserted = await insertWithVariants(supabase, "worker_schedule", [nightPayload]);
      if (!inserted.error) schedules += 1;

      const nightEvent = {
        worker_id: worker.id,
        worker_name: worker.fullName,
        project_id: secondary.id,
        project_name: secondary.name,
        event_type: "RDO",
        start_date: thu,
        end_date: thu,
        is_full_day: false,
        start_time: "18:00",
        end_time: "06:00",
        notes: `${SEED_TAG} · Night shift roster`,
        trade: "Labourer",
        display_code: "NIGHT",
        bg_color: "#1e293b",
        text_color: "#ffffff",
      };
      const nightInserted = await insertWithVariants(supabase, "worker_calendar_events", [nightEvent]);
      if (!nightInserted.error) events += 1;
    }

    if (index === 1 && wed) {
      const leavePayload = {
        worker_id: worker.id,
        worker_name: worker.fullName,
        project_id: primary.id,
        first_date: wed,
        last_date: wed,
        number_of_days: 1,
        reason: `${SEED_TAG} · Annual leave`,
        signature_url: "https://example.com/seed/leave-signature.png",
        status: "approved",
        leave_type: "Annual Leave",
      };
      const leaveInserted = await insertWithVariants(supabase, "leave_requests", [
        leavePayload,
        {
          worker_id: worker.id,
          project_id: primary.id,
          first_date: wed,
          last_date: wed,
          number_of_days: 1,
          reason: `${SEED_TAG} · Annual leave`,
          status: "approved",
          leave_type: "Annual Leave",
        },
      ]);
      if (leaveInserted.error) {
        console.warn(`Annual leave ${worker.fullName}: ${leaveInserted.error}`);
      } else {
        leaveRequests += 1;
      }

      const leaveEventVariants = [
        {
          worker_id: worker.id,
          worker_name: worker.fullName,
          project_id: primary.id,
          project_name: primary.name,
          event_type: "Holiday Approved",
          start_date: wed,
          end_date: wed,
          is_full_day: true,
          notes: `${SEED_TAG} · Annual Leave`,
          leave_kind: "holiday_approved",
          leave_status: "Approved",
          leave_request_id: leaveInserted.id,
          display_code: "AL",
          bg_color: "#059669",
          text_color: "#ffffff",
        },
        {
          worker_id: worker.id,
          worker_name: worker.fullName,
          project_id: primary.id,
          project_name: primary.name,
          event_type: "Leave",
          start_date: wed,
          end_date: wed,
          is_full_day: true,
          notes: `${SEED_TAG} · Annual Leave`,
        },
      ];
      const eventInserted = await insertWithVariants(
        supabase,
        "worker_calendar_events",
        leaveEventVariants
      );
      if (eventInserted.error) {
        console.warn(`Annual leave event ${worker.fullName}: ${eventInserted.error}`);
      } else {
        events += 1;
      }
    }

    if (index === 2 && fri) {
      const sickPayload = {
        worker_id: worker.id,
        worker_name: worker.fullName,
        project_id: secondary.id,
        first_date: fri,
        last_date: fri,
        number_of_days: 1,
        reason: `${SEED_TAG} · Sick leave`,
        signature_url: "https://example.com/seed/leave-signature.png",
        status: "approved",
        leave_type: "Personal Leave",
      };
      const sickInserted = await insertWithVariants(supabase, "leave_requests", [
        sickPayload,
        {
          worker_id: worker.id,
          project_id: secondary.id,
          first_date: fri,
          last_date: fri,
          number_of_days: 1,
          reason: `${SEED_TAG} · Sick leave`,
          status: "approved",
          leave_type: "Personal Leave",
        },
        {
          worker_id: worker.id,
          project_id: secondary.id,
          first_date: fri,
          last_date: fri,
          number_of_days: 1,
          reason: `${SEED_TAG} · Sick leave`,
          status: "approved",
        },
      ]);
      if (sickInserted.error) {
        console.warn(`Sick leave ${worker.fullName}: ${sickInserted.error}`);
      } else {
        leaveRequests += 1;
      }

      const sickEventVariants = [
        {
          worker_id: worker.id,
          worker_name: worker.fullName,
          project_id: secondary.id,
          project_name: secondary.name,
          event_type: "Leave",
          start_date: fri,
          end_date: fri,
          is_full_day: true,
          notes: `${SEED_TAG} · Sick Leave`,
          leave_kind: "sick",
          leave_status: "Approved",
          leave_request_id: sickInserted.id,
          display_code: "SL",
          bg_color: "#dc2626",
          text_color: "#ffffff",
        },
        {
          worker_id: worker.id,
          worker_name: worker.fullName,
          project_id: secondary.id,
          project_name: secondary.name,
          event_type: "Leave",
          start_date: fri,
          end_date: fri,
          is_full_day: true,
          notes: `${SEED_TAG} · Sick Leave`,
        },
      ];
      const eventInserted = await insertWithVariants(
        supabase,
        "worker_calendar_events",
        sickEventVariants
      );
      if (eventInserted.error) {
        console.warn(`Sick leave event ${worker.fullName}: ${eventInserted.error}`);
      } else {
        events += 1;
      }
    }

    if (index === 3 && sat) {
      const rdoEvent = {
        worker_id: worker.id,
        worker_name: worker.fullName,
        project_id: primary.id,
        project_name: primary.name,
        event_type: "RDO",
        start_date: sat,
        end_date: sat,
        is_full_day: true,
        notes: `${SEED_TAG} · Scheduled RDO`,
        display_code: "RDO",
        bg_color: "#64748b",
        text_color: "#ffffff",
        leave_kind: "rdo",
      };
      const eventInserted = await insertWithVariants(supabase, "worker_calendar_events", [rdoEvent]);
      if (!eventInserted.error) events += 1;
    }

    await supabase.from("project_worker_assignments").upsert(
      [
        {
          project_id: dayProject.id,
          worker_id: worker.id,
          worker_name: worker.fullName,
          project_name: dayProject.name,
          status: "Active",
        },
      ],
      { onConflict: "project_id,worker_id", ignoreDuplicates: true }
    );
  }

  if (sun && workers[0]) {
    const weekendSchedule = {
      worker_id: workers[0].id,
      project_id: primary.id,
      project_name: primary.name,
      start_date: sun,
      end_date: sun,
      role_on_site: `${SEED_TAG}|Weekend Call-out`,
      schedule_kind: "assignment",
    };
    const inserted = await insertWithVariants(supabase, "worker_schedule", [weekendSchedule]);
    if (!inserted.error) schedules += 1;
  }

  return { schedules, events, leaveRequests };
}

async function seedSiteForms(
  supabase: SupabaseClient,
  workers: SeedWorker[],
  projects: SeedProject[],
  weekDates: string[]
): Promise<number> {
  let count = 0;
  const project = projects[0]!;
  const submitter = workers[0]!;
  const formDates = [weekDates[0], weekDates[1], weekDates[2], weekDates[4], formatIsoDate(new Date())].filter(
    Boolean
  ) as string[];

  const safetyWalks = [
    {
      title: "Weekly Site Safety Walk — Pass",
      formData: {
        client: "A Plus",
        description_of_works: "General site inspection — all areas compliant",
        cleanliness: "yes",
        material_storage: "yes",
        plant: "yes",
        permits_excavation: "yes",
        permits_hot_works: "na",
        hazards_to_report: "no",
      },
      photoUrls: ["https://example.com/seed/safety-walk-pass-1.jpg"],
    },
    {
      title: "Excavation Zone Safety Walk — Fail",
      formData: {
        client: "A Plus",
        description_of_works: "Excavation zone inspection",
        cleanliness: "no",
        material_storage: "yes",
        plant: "no",
        permits_excavation: "no",
        permits_hot_works: "na",
        hazards_to_report: "yes",
        hazards_to_report_photo_url: "https://example.com/seed/hazard-excavation.jpg",
      },
      photoUrls: [
        "https://example.com/seed/safety-walk-fail-1.jpg",
        "https://example.com/seed/safety-walk-fail-2.jpg",
      ],
    },
    {
      title: "Crane Lift Zone Safety Walk — Open Hazard",
      formData: {
        client: "A Plus",
        description_of_works: "Crane lift zone perimeter check",
        cleanliness: "yes",
        material_storage: "no",
        plant: "yes",
        permits_excavation: "na",
        hazards_to_report: "yes",
        hazards_to_report_photo_url: "https://example.com/seed/hazard-crane-zone.jpg",
      },
      photoUrls: ["https://example.com/seed/safety-walk-hazard.jpg"],
      status: "Open",
    },
    {
      title: "Resolved Hazard Follow-up Walk",
      formData: {
        client: "A Plus",
        description_of_works: "Follow-up after corrective actions",
        cleanliness: "yes",
        material_storage: "yes",
        plant: "yes",
        hazards_to_report: "no",
        resolution_notes: `${SEED_TAG} · Previous hazard rectified`,
      },
      photoUrls: ["https://example.com/seed/safety-walk-resolved.jpg"],
      status: "Resolved",
    },
  ];

  for (const [index, walk] of safetyWalks.entries()) {
    const payload = buildSiteFormInsertPayload({
      formType: "safety_walk",
      projectId: project.id,
      workerId: workers[index % workers.length]!.id,
      formDate: formDates[index % formDates.length]!,
      formTime: "07:00:00",
      title: walk.title,
      status: walk.status ?? "Completed",
      projectName: project.name,
      notes: `${SEED_TAG} · ${walk.title}`,
      formData: { ...walk.formData, seed_tag: SEED_TAG },
      photoUrls: walk.photoUrls,
      attendees: [
        {
          worker_id: submitter.id,
          worker_name: submitter.fullName,
          present: true,
          signature_url: "https://example.com/seed/form-signature.png",
        },
      ],
      submitterSignatureUrl: "https://example.com/seed/form-signature.png",
    });

    const result = await insertWithFormMetadataFallback(supabase, "site_forms", payload);
    if (!result.error) count += 1;
  }

  const toolboxTalks = [
    {
      subject: "Working Near Mobile Plant",
      comments: "Reviewed exclusion zones and spotter requirements.",
      swms: ["Mobile Plant Operations"],
    },
    {
      subject: "Heat Stress Management",
      comments: "Hydration breaks and shade rest areas confirmed.",
      swms: ["General Construction"],
    },
  ];

  for (const [index, talk] of toolboxTalks.entries()) {
    const payload = buildSiteFormInsertPayload({
      formType: "toolbox_talk",
      projectId: project.id,
      workerId: workers[(index + 1) % workers.length]!.id,
      formDate: formDates[index + 1] ?? formDates[0]!,
      formTime: "06:30:00",
      title: `Toolbox Talk — ${talk.subject}`,
      status: "Completed",
      projectName: project.name,
      notes: `${SEED_TAG} · Toolbox talk register`,
      formData: {
        toolbox_subject: talk.subject,
        comments_points_raised: talk.comments,
        related_swms: talk.swms,
        seed_tag: SEED_TAG,
      },
      attendees: workers.slice(0, 3).map((worker) => ({
        worker_id: worker.id,
        worker_name: worker.fullName,
        present: true,
        signature_url: "https://example.com/seed/toolbox-signature.png",
      })),
      submitterSignatureUrl: "https://example.com/seed/toolbox-signature.png",
    });

    const result = await insertWithFormMetadataFallback(supabase, "site_forms", payload);
    if (!result.error) count += 1;
  }

  const dailyPrestarts = [
    {
      hazards: ["Underground services", "Mobile plant interaction"],
      status: "Completed",
    },
    {
      hazards: ["None"],
      status: "Completed",
    },
    {
      hazards: ["Open excavation — barricades required"],
      status: "Open",
    },
  ];

  for (const [index, meeting] of dailyPrestarts.entries()) {
    const payload = buildSiteFormInsertPayload({
      formType: "daily_prestart",
      projectId: project.id,
      workerId: workers[index % workers.length]!.id,
      formDate: formDates[index] ?? formDates[0]!,
      formTime: "06:00:00",
      title: "Daily Pre-Start Meeting",
      status: meeting.status,
      projectName: project.name,
      notes: `${SEED_TAG} · Crew daily pre-start`,
      formData: {
        client: "A Plus",
        scope_of_works: ["Earthworks", "Compaction"],
        a_plus_location_description: "Northern cut — Level 1",
        related_swms: ["Excavation", "Mobile Plant Operations"],
        correct_permits_required: "yes",
        confirm_siting_itcs: "yes",
        significant_hazards: meeting.hazards,
        seed_tag: SEED_TAG,
      },
      attendees: workers.slice(0, 4).map((worker) => ({
        worker_id: worker.id,
        worker_name: worker.fullName,
        present: true,
        signature_url: "https://example.com/seed/daily-prestart-signature.png",
      })),
      submitterSignatureUrl: "https://example.com/seed/daily-prestart-signature.png",
    });

    const result = await insertWithFormMetadataFallback(supabase, "site_forms", payload);
    if (!result.error) count += 1;
  }

  return count;
}

async function seedWorkerVocs(
  supabase: SupabaseClient,
  workers: SeedWorker[]
): Promise<number> {
  const vocCatalog = [
    { title: "White Card", org: "SafeWork NSW", yearsValid: 5 },
    { title: "Excavator Operation (>20t)", org: "Civil Training RTO", yearsValid: 3 },
    { title: "Telehandler Operation", org: "Civil Training RTO", yearsValid: 3 },
    { title: "Roller Operation", org: "Plant Skills Australia", yearsValid: 3 },
  ];

  let count = 0;

  for (const worker of workers) {
    for (const voc of vocCatalog) {
      const issueDate = "2024-03-15";
      const expiryDate = addDaysIso(issueDate, voc.yearsValid * 365);

      const payloadVariants = [
        {
          worker_id: worker.id,
          title: voc.title,
          issuing_org: voc.org,
          issue_date: issueDate,
          expiry_date: expiryDate,
          document_url: `https://example.com/seed/voc/${worker.id}/${encodeURIComponent(voc.title)}.pdf`,
          notes: SEED_TAG,
        },
        {
          worker_id: worker.id,
          title: voc.title,
          issue_date: issueDate,
          expiry_date: expiryDate,
        },
      ];

      const { data: existing } = await supabase
        .from("worker_vocs")
        .select("id")
        .eq("worker_id", worker.id)
        .eq("title", voc.title)
        .maybeSingle();

      if (existing?.id) {
        await supabase.from("worker_vocs").update(payloadVariants[0]!).eq("id", existing.id);
        count += 1;
        continue;
      }

      const inserted = await insertWithVariants(supabase, "worker_vocs", payloadVariants);
      if (!inserted.error) count += 1;
    }

    await supabase
      .from("workers")
      .update({
        white_card_number: "WC-SEED-1001",
        white_card_issue_date: "2024-03-15",
        drivers_licence_number: "NSW-SEED-8844",
        drivers_licence_class: "C LR",
        drivers_licence_expiry: addDaysIso(formatIsoDate(new Date()), 365),
        status: "active",
      })
      .eq("id", worker.id);
  }

  return count;
}

async function seedSwms(
  supabase: SupabaseClient,
  workers: SeedWorker[],
  projects: SeedProject[]
): Promise<{ documents: number; assignments: number }> {
  const project = projects[0]!;
  const today = formatIsoDate(new Date());
  let documents = 0;
  let assignments = 0;

  const swmsDocs = [
    {
      title: "Excavation & Trenching SWMS",
      fileUrl: "https://example.com/seed/swms/excavation-trenching.pdf",
    },
    {
      title: "Mobile Plant Operations SWMS",
      fileUrl: "https://example.com/seed/swms/mobile-plant.pdf",
    },
    {
      title: "Hot Works SWMS",
      fileUrl: "https://example.com/seed/swms/hot-works.pdf",
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

    const legacyInsert = await insertWithVariants(supabase, "swms", [extendedPayload, basePayload]);
    if (legacyInsert.error) {
      console.warn(`SWMS legacy row ${doc.title}: ${legacyInsert.error}`);
    }

    const documentsInsert = await insertWithVariants(supabase, "swms_documents", [
      extendedPayload,
      basePayload,
    ]);
    if (documentsInsert.error) {
      console.warn(`SWMS document ${doc.title}: ${documentsInsert.error}`);
      continue;
    }

    documents += 1;
    const resolvedSwmsId = documentsInsert.id ?? swmsId;

    for (const [index, worker] of workers.slice(0, 3).entries()) {
      const token = `${SEED_TAG}-${doc.title.replace(/\W+/g, "-").toLowerCase()}-${worker.id.slice(0, 8)}-${index}`;
      const signed = index < 2;
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
          signature_url: signed ? "https://example.com/seed/swms-signature.png" : null,
          signed_at: signed ? isoDateTime(today, "08:00:00") : null,
        },
        {
          swms_id: resolvedSwmsId,
          assignee_type: "worker",
          assignee_id: worker.id,
          assignee_name: worker.fullName,
          signing_token: token,
          status: signed ? "Signed" : "Pending",
        },
      ];

      const inserted = await insertWithVariants(supabase, "swms_assignments", assignmentVariants);
      if (inserted.error) {
        console.warn(`SWMS assignment ${doc.title} / ${worker.fullName}: ${inserted.error}`);
        continue;
      }

      assignments += 1;
    }
  }

  return { documents, assignments };
}

async function deleteSeedSiteForms(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase
    .from("site_forms")
    .delete()
    .contains("form_data", { seed_tag: SEED_TAG });
  if (error) console.warn("Cleanup site_forms:", error.message);
}

async function deleteSeedRowsByNotes(
  supabase: SupabaseClient,
  table: string,
  notesColumn = "notes"
): Promise<void> {
  const { error } = await supabase.from(table).delete().ilike(notesColumn, `%${SEED_TAG}%`);
  if (error) console.warn(`Cleanup ${table}:`, error.message);
}

async function cleanupSeedData(supabase: SupabaseClient): Promise<void> {
  const unitNumbers = PLANT_SPECS.map((row) => row.unitNumber);

  const { data: plantRows } = await supabase
    .from("plant")
    .select("id")
    .in("unit_number", unitNumbers);
  const plantIds = (plantRows ?? []).map((row) => String(row.id));

  const { data: workerRows } = await supabase
    .from("workers")
    .select("id,email")
    .or(`email.ilike.%@${SEED_EMAIL_DOMAIN},notes.ilike.%${SEED_TAG}%`);
  const workerIds = (workerRows ?? []).map((row) => String(row.id));

  const { data: swmsRows } = await supabase
    .from("swms_documents")
    .select("id")
    .in(
      "title",
      [
        "Excavation & Trenching SWMS",
        "Mobile Plant Operations SWMS",
        "Hot Works SWMS",
      ]
    );
  const swmsIds = (swmsRows ?? []).map((row) => String(row.id));

  if (swmsIds.length > 0) {
    await supabase.from("swms_assignments").delete().in("swms_id", swmsIds);
    await supabase.from("swms_documents").delete().in("id", swmsIds);
    await supabase.from("swms").delete().in("id", swmsIds);
  }

  await deleteSeedSiteForms(supabase);
  await deleteSeedRowsByNotes(supabase, "plant_service_schedules");
  await deleteSeedRowsByNotes(supabase, "leave_requests", "reason");

  if (plantIds.length > 0) {
    await supabase.from("plant_prestarts").delete().in("plant_id", plantIds);
    await supabase.from("project_plant_assignments").delete().in("plant_id", plantIds);
    await supabase.from("plant_service_schedules").delete().in("plant_id", plantIds);
  }

  if (workerIds.length > 0) {
    await supabase.from("worker_calendar_events").delete().in("worker_id", workerIds);
    await supabase.from("worker_schedule").delete().in("worker_id", workerIds);
    await supabase.from("project_worker_assignments").delete().in("worker_id", workerIds);
    await supabase.from("worker_vocs").delete().in("worker_id", workerIds);
    await supabase.from("leave_requests").delete().in("worker_id", workerIds);
    await supabase.from("site_forms").delete().in("worker_id", workerIds);
  }

  await supabase.from("plant_equipment").delete().in("unit_number", unitNumbers);
  if (plantIds.length > 0) {
    await supabase.from("plant").delete().in("id", plantIds);
  }

  await supabase.from("workers").delete().in("id", workerIds);

  console.log(
    `Cleanup complete — removed ${plantIds.length} plant asset(s), ${workerIds.length} seed worker(s), ${swmsIds.length} SWMS doc(s).`
  );
}

export async function runDashboardCalendarSeed(options: {
  supabase: SupabaseClient;
  cleanup?: boolean;
}): Promise<void> {
  if (options.cleanup) {
    await cleanupSeedData(options.supabase);
    return;
  }

  const weekDates = getCurrentWeekDates();
  const nextWeekDates = getNextWeekDates();
  const projects = await resolveProjects(options.supabase);
  const workers = await resolveWorkers(options.supabase);

  await deleteSeedSiteForms(options.supabase);
  await deleteSeedRowsByNotes(options.supabase, "plant_service_schedules");
  await deleteSeedRowsByNotes(options.supabase, "leave_requests", "reason");

  const swmsTitles = [
    "Excavation & Trenching SWMS",
    "Mobile Plant Operations SWMS",
    "Hot Works SWMS",
  ];
  const { data: existingSwms } = await options.supabase
    .from("swms_documents")
    .select("id")
    .in("title", swmsTitles);
  const existingSwmsIds = (existingSwms ?? []).map((row) => String(row.id));
  if (existingSwmsIds.length > 0) {
    await options.supabase.from("swms_assignments").delete().in("swms_id", existingSwmsIds);
    await options.supabase.from("swms_documents").delete().in("id", existingSwmsIds);
    await options.supabase.from("swms").delete().in("id", existingSwmsIds);
  }

  for (const worker of workers) {
    await options.supabase
      .from("worker_schedule")
      .delete()
      .eq("worker_id", worker.id)
      .gte("start_date", weekDates[0]!)
      .lte("end_date", weekDates[weekDates.length - 1]!);
    await options.supabase
      .from("worker_calendar_events")
      .delete()
      .eq("worker_id", worker.id)
      .ilike("notes", `%${SEED_TAG}%`);
  }

  const plants: SeedPlant[] = [];
  for (let index = 0; index < PLANT_SPECS.length; index += 1) {
    const spec = PLANT_SPECS[index]!;
    const project = projects[index % projects.length]!;
    plants.push(await upsertSeedPlant(options.supabase, spec, project, index));
  }

  const serviceCount = await seedPlantServices(
    options.supabase,
    plants,
    weekDates,
    nextWeekDates
  );
  const prestartCount = await seedPlantPrestarts(
    options.supabase,
    plants,
    PLANT_SPECS,
    workers,
    projects,
    weekDates
  );
  const roster = await seedWorkerSchedulesAndEvents(
    options.supabase,
    workers,
    projects,
    weekDates
  );
  const siteFormCount = await seedSiteForms(options.supabase, workers, projects, weekDates);
  const vocCount = await seedWorkerVocs(options.supabase, workers);
  const swms = await seedSwms(options.supabase, workers, projects);

  console.log("\nDashboard & calendar seed complete.\n");
  console.log(`Tag: ${SEED_TAG}`);
  console.log(`Week: ${weekDates[0]} → ${weekDates[weekDates.length - 1]}`);
  console.log(`Next week services through: ${nextWeekDates[nextWeekDates.length - 1]}`);
  console.log(`Projects: ${projects.map((row) => row.name).join(" · ")}`);
  console.log(`Workers seeded: ${workers.length}`);
  console.log(`Plant assets: ${plants.length}`);
  console.log(`Plant service bookings: ${serviceCount}`);
  console.log(`Plant pre-start logs: ${prestartCount}`);
  console.log(`Worker schedule rows: ${roster.schedules}`);
  console.log(`Worker calendar events: ${roster.events}`);
  console.log(`Leave requests: ${roster.leaveRequests}`);
  console.log(`Site forms: ${siteFormCount}`);
  console.log(`Worker VOCs: ${vocCount}`);
  console.log(`SWMS documents: ${swms.documents} · assignments: ${swms.assignments}`);
  console.log("\nOpen Project Dashboard, Worker Calendar, and Plant Calendar to review.\n");
}

async function main(): Promise<void> {
  const env = getSupabaseEnv();
  if (!env) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
    process.exit(1);
  }

  const cleanup = process.argv.includes("--cleanup");
  const supabase = createClient(env.url, env.anonKey);

  try {
    await runDashboardCalendarSeed({ supabase, cleanup });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

void main();
