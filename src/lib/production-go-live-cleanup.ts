/**
 * Production go-live database cleanup — removes operational test data while preserving
 * the primary owner account, system induction templates, and pay rule configuration.
 */

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { MASTER_ADMIN_EMAIL } from "./master-admin-config";
import { runMasterAdminSeed } from "./master-admin-seed";
import { cleanupComprehensiveTestSeed, SEED_TAG as COMPREHENSIVE_SEED_TAG } from "./seed-test-data";
import {
  deleteNonSystemInductionTemplates,
  loadStandardInductionTemplates,
  seedStandardInductionTemplates,
} from "../../scripts/lib/standard-induction-seed";

const DELETE_SENTINEL = "00000000-0000-0000-0000-000000000000";

export interface ProductionCleanupSummary {
  ownerEmail: string;
  ownerWorkerId: string | null;
  ownerAuthUserId: string | null;
  workersRemoved: number;
  authUsersRemoved: number;
  profilesRemoved: number;
  projectsRemoved: number;
  inductionTemplatesKept: number;
  payRulesKept: number;
  payRuleTemplatesKept: number;
  tablesCleared: string[];
  warnings: string[];
  sanityCheckPassed: boolean;
}

async function deleteAllRows(
  supabase: SupabaseClient,
  table: string,
  idColumn = "id"
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await supabase
    .from(table)
    .delete()
    .neq(idColumn, DELETE_SENTINEL);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
}

async function clearTable(
  supabase: SupabaseClient,
  table: string,
  summary: ProductionCleanupSummary
): Promise<void> {
  const result = await deleteAllRows(supabase, table);
  if (result.ok) {
    summary.tablesCleared.push(table);
    return;
  }
  summary.warnings.push(`${table}: ${result.error}`);
}

async function findOwnerWorker(
  supabase: SupabaseClient
): Promise<{ id: string; authUserId: string | null; email: string } | null> {
  const target = MASTER_ADMIN_EMAIL.trim().toLowerCase();

  const selectVariants = [
    "id, email, auth_user_id",
    "id, email",
  ] as const;

  for (const select of selectVariants) {
    const { data, error } = await supabase
      .from("workers")
      .select(select)
      .ilike("email", target)
      .maybeSingle();

    if (error) {
      if (error.message.toLowerCase().includes("auth_user_id")) continue;
      throw new Error(`Failed to resolve owner worker: ${error.message}`);
    }

    const row = data as {
      id?: unknown;
      email?: unknown;
      auth_user_id?: unknown;
    } | null;

    if (!row?.id) return null;

    return {
      id: String(row.id),
      authUserId:
        "auth_user_id" in row && row.auth_user_id
          ? String(row.auth_user_id)
          : null,
      email: String(row.email ?? target),
    };
  }

  return null;
}

async function listAuthUsers(admin: SupabaseClient): Promise<User[]> {
  const users: User[] = [];
  let page = 1;

  while (page <= 50) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Failed to list auth users: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 200) break;
    page += 1;
  }

  return users;
}

async function deleteNonOwnerWorkers(
  supabase: SupabaseClient,
  ownerWorkerId: string,
  summary: ProductionCleanupSummary
): Promise<string[]> {
  const { data: workers, error } = await supabase.from("workers").select("id, email");

  if (error) {
    summary.warnings.push(`workers list: ${error.message}`);
    return [];
  }

  const removeIds: string[] = [];
  const removeAuthIds: string[] = [];

  for (const row of workers ?? []) {
    const id = String(row.id);
    if (id === ownerWorkerId) continue;

    const email = String(row.email ?? "").trim().toLowerCase();
    const isOwnerEmail = email === MASTER_ADMIN_EMAIL.trim().toLowerCase();

    if (!isOwnerEmail) {
      removeIds.push(id);
    }
  }

  try {
    const { data: profileRows } = await supabase.from("profiles").select("id, email, worker_id");
    for (const profile of profileRows ?? []) {
      const profileEmail = String(profile.email ?? "").trim().toLowerCase();
      const linkedWorker = String(profile.worker_id ?? "");
      if (profileEmail === MASTER_ADMIN_EMAIL.trim().toLowerCase()) continue;
      if (ownerWorkerId && linkedWorker === ownerWorkerId) continue;
      if (profile.id) removeAuthIds.push(String(profile.id));
    }
  } catch {
    // profiles table may not exist yet
  }

  if (removeIds.length === 0) {
    return removeAuthIds;
  }

  for (const workerId of removeIds) {
    await supabase.from("form_worker_assignments").delete().eq("worker_id", workerId);
    await supabase.from("worker_timesheets").delete().eq("worker_id", workerId);
    await supabase.from("leave_requests").delete().eq("worker_id", workerId);
    await supabase.from("worker_calendar_events").delete().eq("worker_id", workerId);
    await supabase.from("worker_schedule").delete().eq("worker_id", workerId);
    await supabase.from("worker_vocs").delete().eq("worker_id", workerId);
    await supabase.from("worker_requests").delete().eq("worker_id", workerId);
    await supabase.from("project_worker_assignments").delete().eq("worker_id", workerId);
    await supabase.from("swms_assignments").delete().eq("worker_id", workerId);
    await supabase.from("site_forms").delete().eq("worker_id", workerId);
  }

  const { error: deleteError } = await supabase.from("workers").delete().in("id", removeIds);
  if (deleteError) {
    summary.warnings.push(`workers delete: ${deleteError.message}`);
  } else {
    summary.workersRemoved = removeIds.length;
  }

  return removeAuthIds;
}

async function deleteNonOwnerProfiles(
  supabase: SupabaseClient,
  ownerAuthUserId: string | null,
  ownerWorkerId: string | null,
  summary: ProductionCleanupSummary
): Promise<void> {
  const { data: profiles, error: listError } = await supabase
    .from("profiles")
    .select("id, email, worker_id");

  if (listError) {
    if (listError.message.toLowerCase().includes("profiles")) {
      summary.warnings.push("profiles table not available — skipped profile cleanup");
      return;
    }
    summary.warnings.push(`profiles: ${listError.message}`);
    return;
  }

  const removeIds = (profiles ?? [])
    .filter((row) => {
      if (ownerAuthUserId && String(row.id) === ownerAuthUserId) return false;
      const email = String(row.email ?? "").trim().toLowerCase();
      if (email === MASTER_ADMIN_EMAIL.trim().toLowerCase()) return false;
      if (ownerWorkerId && String(row.worker_id ?? "") === ownerWorkerId) return false;
      return true;
    })
    .map((row) => String(row.id));

  if (removeIds.length === 0) return;

  const { error } = await supabase.from("profiles").delete().in("id", removeIds);
  if (error) {
    summary.warnings.push(`profiles delete: ${error.message}`);
    return;
  }

  summary.profilesRemoved = removeIds.length;
}

async function deleteNonOwnerAuthUsers(
  admin: SupabaseClient,
  ownerAuthUserId: string | null,
  extraAuthIds: string[],
  summary: ProductionCleanupSummary
): Promise<void> {
  const users = await listAuthUsers(admin);
  const preserve = new Set<string>();
  if (ownerAuthUserId) preserve.add(ownerAuthUserId);

  for (const user of users) {
    const email = user.email?.trim().toLowerCase() ?? "";
    if (email === MASTER_ADMIN_EMAIL.trim().toLowerCase()) {
      preserve.add(user.id);
    }
  }

  const toRemove = users.filter((user) => !preserve.has(user.id));
  for (const authId of extraAuthIds) {
    if (!preserve.has(authId) && !toRemove.some((user) => user.id === authId)) {
      toRemove.push({ id: authId } as User);
    }
  }

  for (const user of toRemove) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      summary.warnings.push(`auth delete ${user.id}: ${error.message}`);
    } else {
      summary.authUsersRemoved += 1;
    }
  }
}

async function countRows(supabase: SupabaseClient, table: string): Promise<number | null> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) return null;
  return count ?? 0;
}

export async function runProductionGoLiveCleanup(options: {
  supabase: SupabaseClient;
  admin: SupabaseClient;
  dryRun?: boolean;
}): Promise<ProductionCleanupSummary> {
  const summary: ProductionCleanupSummary = {
    ownerEmail: MASTER_ADMIN_EMAIL,
    ownerWorkerId: null,
    ownerAuthUserId: null,
    workersRemoved: 0,
    authUsersRemoved: 0,
    profilesRemoved: 0,
    projectsRemoved: 0,
    inductionTemplatesKept: 0,
    payRulesKept: 0,
    payRuleTemplatesKept: 0,
    tablesCleared: [],
    warnings: [],
    sanityCheckPassed: false,
  };

  const owner = await findOwnerWorker(options.supabase);
  summary.ownerWorkerId = owner?.id ?? null;
  summary.ownerAuthUserId = owner?.authUserId ?? null;

  if (options.dryRun) {
    const workerCount = await countRows(options.supabase, "workers");
    const projectCount = await countRows(options.supabase, "projects");
    summary.warnings.push(
      `DRY RUN — would preserve owner ${MASTER_ADMIN_EMAIL} (${owner?.id ?? "not found"})`
    );
    summary.warnings.push(`DRY RUN — workers: ${workerCount ?? "?"}, projects: ${projectCount ?? "?"}`);
    return summary;
  }

  console.log("Phase 1/6 — Seed-tagged test data…");
  try {
    await cleanupComprehensiveTestSeed(options.supabase);
  } catch (error) {
    summary.warnings.push(
      `comprehensive seed cleanup: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  console.log("Phase 2/6 — Operational records (timesheets, forms, assignments)…");
  const operationalTables = [
    "form_worker_assignments",
    "worker_timesheets",
    "leave_requests",
    "worker_calendar_events",
    "worker_schedule",
    "worker_vocs",
    "worker_requests",
    "site_forms",
    "swms_assignments",
    "project_worker_assignments",
    "project_plant_assignments",
    "plant_prestarts",
    "plant_service_history",
    "plant_service_schedules",
    "rfis",
    "generated_reports",
    "document_pack_exports",
    "expiry_alert_logs",
  ];

  for (const table of operationalTables) {
    await clearTable(options.supabase, table, summary);
  }

  await options.supabase.from("site_forms").delete().contains("form_data", { seed_tag: COMPREHENSIVE_SEED_TAG });

  console.log("Phase 3/6 — Projects, plant/fleet, SWMS documents…");
  const projectLinkedTables = [
    "itc_signoff_edits",
    "itc_signoffs",
    "itc_change_requests",
    "itc_photos",
    "itc_compaction_test_links",
    "itc_compaction_tests",
    "itc_inspection_activities",
    "itc_batch_items",
    "itc_drawing_pins",
    "project_itcs",
    "project_itp_items",
    "project_itps",
    "asset_project_assignments",
    "assets",
    "subcontractor_plant",
    "subcontractor_workers",
    "subcontractor_documents",
    "subcontractors",
    "dashboard_layouts",
  ];

  for (const table of projectLinkedTables) {
    await clearTable(options.supabase, table, summary);
  }

  await clearTable(options.supabase, "swms_documents", summary);
  await clearTable(options.supabase, "swms", summary);
  await clearTable(options.supabase, "plant_equipment", summary);
  await clearTable(options.supabase, "plant", summary);
  await clearTable(options.supabase, "organization_fleet", summary);

  const projectCountBefore = await countRows(options.supabase, "projects");
  await clearTable(options.supabase, "projects", summary);
  summary.projectsRemoved = projectCountBefore ?? 0;

  console.log("Phase 4/6 — Non-owner workers, profiles, and auth users…");
  const ownerWorkerId = summary.ownerWorkerId;
  if (ownerWorkerId) {
    const extraAuthIds = await deleteNonOwnerWorkers(
      options.supabase,
      ownerWorkerId,
      summary
    );
    await deleteNonOwnerProfiles(
      options.supabase,
      summary.ownerAuthUserId,
      ownerWorkerId,
      summary
    );
    await deleteNonOwnerAuthUsers(
      options.admin,
      summary.ownerAuthUserId,
      extraAuthIds,
      summary
    );
  } else {
    summary.warnings.push(
      `Owner worker ${MASTER_ADMIN_EMAIL} not found — skipping worker/auth deletion. Run seed:admin first.`
    );
  }

  console.log("Phase 5/6 — Induction templates (keep 4 system templates)…");
  await clearTable(options.supabase, "form_worker_assignments", summary);
  const customResult = await deleteNonSystemInductionTemplates(options.supabase);
  if (customResult.error) {
    summary.warnings.push(`custom induction templates: ${customResult.error}`);
  }

  const seedResult = await seedStandardInductionTemplates(options.supabase, {
    restoreContent: true,
    verbose: false,
  });
  if (seedResult.errors.length > 0) {
    summary.warnings.push(...seedResult.errors.map((message) => `induction seed: ${message}`));
  }
  if (seedResult.warnings.length > 0) {
    summary.warnings.push(...seedResult.warnings);
  }

  console.log("Phase 6/6 — Restore owner account & sanity check…");
  try {
    const master = await runMasterAdminSeed({ supabase: options.supabase });
    summary.ownerWorkerId = master.workerId;
    summary.ownerAuthUserId = master.authUserId;
  } catch (error) {
    summary.warnings.push(
      `owner restore: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const systemKeys = new Set(loadStandardInductionTemplates().map((row) => row.system_template_key));
  const systemTitles = new Set(loadStandardInductionTemplates().map((row) => row.title));
  const { data: inductionRows } = await options.supabase
    .from("induction_form_templates")
    .select("id, system_template_key, title");

  summary.inductionTemplatesKept = (inductionRows ?? []).filter((row) => {
    const key = row.system_template_key ? String(row.system_template_key) : "";
    const title = row.title ? String(row.title) : "";
    return systemKeys.has(key) || systemTitles.has(title);
  }).length;

  summary.payRulesKept = (await countRows(options.supabase, "pay_rates_and_rules")) ?? 0;
  summary.payRuleTemplatesKept = (await countRows(options.supabase, "pay_rule_templates")) ?? 0;

  const workerCount = await countRows(options.supabase, "workers");
  const timesheetCount = await countRows(options.supabase, "worker_timesheets");
  const siteFormCount = await countRows(options.supabase, "site_forms");
  const projectCount = await countRows(options.supabase, "projects");

  summary.sanityCheckPassed =
    summary.ownerWorkerId != null &&
    (workerCount ?? 0) <= 1 &&
    (timesheetCount ?? 0) === 0 &&
    (siteFormCount ?? 0) === 0 &&
    (projectCount ?? 0) === 0 &&
    summary.inductionTemplatesKept >= 4 &&
    summary.payRulesKept > 0;

  if ((workerCount ?? 0) > 1) {
    summary.warnings.push(`Sanity: expected ≤1 worker, found ${workerCount}`);
  }
  if ((timesheetCount ?? 0) > 0) {
    summary.warnings.push(`Sanity: ${timesheetCount} timesheet row(s) remain`);
  }
  if ((siteFormCount ?? 0) > 0) {
    summary.warnings.push(`Sanity: ${siteFormCount} site form row(s) remain`);
  }
  if ((projectCount ?? 0) > 0) {
    summary.warnings.push(`Sanity: ${projectCount} project row(s) remain`);
  }
  if (summary.inductionTemplatesKept < 4) {
    summary.warnings.push(
      `Sanity: only ${summary.inductionTemplatesKept}/4 system induction templates found — run npm run seed:inductions`
    );
  }
  if (summary.payRulesKept === 0) {
    summary.warnings.push("Sanity: no pay_rates_and_rules rows found");
  }

  return summary;
}
