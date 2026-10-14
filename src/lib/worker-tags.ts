import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./supabase";
import {
  resolveActiveOrganisationId,
  stampOrganisationId,
  withOrganisationScope,
} from "./tenant-scope";

export const TAGS_TABLE = "tags";
export const WORKER_TAGS_TABLE = "worker_tags";

export interface WorkerTag {
  id: string;
  name: string;
  created_at: string | null;
  organisation_id?: string | null;
}

export interface WorkerTagAssignment {
  worker_id: string;
  tag_id: string;
}

function isMissingRelationError(message: string, table: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes(table.toLowerCase()) &&
    (lower.includes("does not exist") ||
      lower.includes("schema cache") ||
      lower.includes("could not find"))
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function mapTag(row: unknown): WorkerTag | null {
  const record = asRecord(row);
  if (!record?.id) return null;
  const name = String(record.name ?? "").trim();
  if (!name) return null;
  return {
    id: String(record.id),
    name,
    created_at: typeof record.created_at === "string" ? record.created_at : null,
    organisation_id:
      record.organisation_id == null ? null : String(record.organisation_id),
  };
}

export async function fetchTags(): Promise<{ tags: WorkerTag[]; error: string | null }> {
  const orgId = resolveActiveOrganisationId();
  if (!orgId) {
    return { tags: [], error: null };
  }
  if (!isSupabaseConfigured()) {
    return { tags: [], error: "Supabase is not configured." };
  }

  try {
    let query = supabase.from(TAGS_TABLE).select("id, name, created_at, organisation_id");
    query = withOrganisationScope(query, orgId);
    const { data, error } = await query.order("name");

    if (error) {
      if (isMissingRelationError(error.message, TAGS_TABLE)) {
        return { tags: [], error: "Tags table is not available. Apply migration 184." };
      }
      return { tags: [], error: error.message };
    }

    return {
      tags: (data ?? []).map(mapTag).filter((row): row is WorkerTag => Boolean(row)),
      error: null,
    };
  } catch (error) {
    return {
      tags: [],
      error: error instanceof Error ? error.message : "Failed to load tags.",
    };
  }
}

export async function createTag(
  name: string
): Promise<{ tag: WorkerTag | null; error: string | null }> {
  const orgId = resolveActiveOrganisationId();
  if (!orgId) {
    return { tag: null, error: "Select an organisation before creating tags." };
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return { tag: null, error: "Title is required." };
  }

  const payload = stampOrganisationId({ name: trimmed });

  try {
    const { data, error } = await supabase
      .from(TAGS_TABLE)
      .insert(payload)
      .select("id, name, created_at, organisation_id")
      .single();

    if (error) {
      if (error.message.toLowerCase().includes("duplicate") || error.code === "23505") {
        return { tag: null, error: "A tag with this title already exists." };
      }
      return { tag: null, error: error.message };
    }

    return { tag: mapTag(data), error: null };
  } catch (error) {
    return {
      tag: null,
      error: error instanceof Error ? error.message : "Failed to create tag.",
    };
  }
}

export async function updateTag(
  id: string,
  name: string
): Promise<{ tag: WorkerTag | null; error: string | null }> {
  const orgId = resolveActiveOrganisationId();
  if (!orgId) {
    return { tag: null, error: "Select an organisation before editing tags." };
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return { tag: null, error: "Title is required." };
  }

  try {
    let query = supabase.from(TAGS_TABLE).update({ name: trimmed }).eq("id", id);
    query = withOrganisationScope(query, orgId);
    const { data, error } = await query
      .select("id, name, created_at, organisation_id")
      .maybeSingle();

    if (error) {
      if (error.message.toLowerCase().includes("duplicate") || error.code === "23505") {
        return { tag: null, error: "A tag with this title already exists." };
      }
      return { tag: null, error: error.message };
    }

    return { tag: mapTag(data), error: data ? null : "Tag not found." };
  } catch (error) {
    return {
      tag: null,
      error: error instanceof Error ? error.message : "Failed to update tag.",
    };
  }
}

export async function deleteTag(id: string): Promise<{ error: string | null }> {
  const orgId = resolveActiveOrganisationId();
  if (!orgId) {
    return { error: "Select an organisation before deleting tags." };
  }

  try {
    let query = supabase.from(TAGS_TABLE).delete().eq("id", id);
    query = withOrganisationScope(query, orgId);
    const { error } = await query;
    if (error) return { error: error.message };
    return { error: null };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to delete tag.",
    };
  }
}

export async function fetchWorkerTagAssignments(): Promise<{
  assignments: WorkerTagAssignment[];
  error: string | null;
}> {
  if (!isSupabaseConfigured()) {
    return { assignments: [], error: "Supabase is not configured." };
  }

  try {
    const { data, error } = await supabase
      .from(WORKER_TAGS_TABLE)
      .select("worker_id, tag_id");

    if (error) {
      if (isMissingRelationError(error.message, WORKER_TAGS_TABLE)) {
        return { assignments: [], error: null };
      }
      return { assignments: [], error: error.message };
    }

    const assignments = (data ?? [])
      .map((row) => asRecord(row))
      .filter((row): row is Record<string, unknown> => Boolean(row?.worker_id && row.tag_id))
      .map((row) => ({
        worker_id: String(row.worker_id),
        tag_id: String(row.tag_id),
      }));

    return { assignments, error: null };
  } catch (error) {
    return {
      assignments: [],
      error: error instanceof Error ? error.message : "Failed to load worker tags.",
    };
  }
}

export function uniqueTagIds(tagIds: string[] | null | undefined): string[] {
  return [...new Set((tagIds ?? []).map((id) => String(id).trim()).filter(Boolean))];
}

export async function insertWorkerTagAssignments(
  client: SupabaseClient,
  workerId: string,
  tagIds: string[],
  organisationId: string | null
): Promise<{ error: string | null }> {
  const uniqueIds = uniqueTagIds(tagIds);
  if (uniqueIds.length === 0) return { error: null };
  if (!organisationId) {
    return { error: "Select an organisation before assigning tags." };
  }

  try {
    let tagQuery = client.from(TAGS_TABLE).select("id").in("id", uniqueIds);
    tagQuery = withOrganisationScope(tagQuery, organisationId);
    const { data: tagRows, error: tagError } = await tagQuery;
    if (tagError) {
      if (isMissingRelationError(tagError.message, TAGS_TABLE)) {
        return { error: "Tags table is not available. Apply migration 184." };
      }
      return { error: tagError.message };
    }

    const allowed = new Set(
      (tagRows ?? [])
        .map((row) => asRecord(row)?.id)
        .filter((id): id is string => typeof id === "string" && Boolean(id))
        .map((id) => String(id))
    );
    const rows = uniqueIds
      .filter((tag_id) => allowed.has(tag_id))
      .map((tag_id) => ({ worker_id: workerId, tag_id }));
    if (rows.length === 0) return { error: null };

    const { error } = await client.from(WORKER_TAGS_TABLE).insert(rows);
    if (error) {
      if (error.code === "23505") return { error: null };
      if (isMissingRelationError(error.message, WORKER_TAGS_TABLE)) {
        return { error: "Tags table is not available. Apply migration 184." };
      }
      return { error: error.message };
    }
    return { error: null };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to assign tags.",
    };
  }
}

export function groupTagsByWorker(
  tags: WorkerTag[],
  assignments: WorkerTagAssignment[]
): Map<string, WorkerTag[]> {
  const tagById = new Map(tags.map((tag) => [tag.id, tag]));
  const map = new Map<string, WorkerTag[]>();

  for (const assignment of assignments) {
    const tag = tagById.get(assignment.tag_id);
    if (!tag) continue;
    const list = map.get(assignment.worker_id) ?? [];
    if (!list.some((item) => item.id === tag.id)) {
      list.push(tag);
    }
    map.set(assignment.worker_id, list);
  }

  for (const list of map.values()) {
    list.sort((left, right) => left.name.localeCompare(right.name));
  }

  return map;
}

export async function assignTagToWorker(
  workerId: string,
  tagId: string
): Promise<{ error: string | null }> {
  const orgId = resolveActiveOrganisationId();
  if (!orgId) {
    return { error: "Select an organisation before assigning tags." };
  }

  try {
    let tagQuery = supabase.from(TAGS_TABLE).select("id").eq("id", tagId);
    tagQuery = withOrganisationScope(tagQuery, orgId);
    const { data: tagRow } = await tagQuery.maybeSingle();
    if (!tagRow) {
      return { error: "Tag not found." };
    }

    const { error } = await supabase.from(WORKER_TAGS_TABLE).insert({
      worker_id: workerId,
      tag_id: tagId,
    });
    if (error) {
      if (error.code === "23505") return { error: null };
      return { error: error.message };
    }
    return { error: null };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to assign tag.",
    };
  }
}

export async function removeTagFromWorker(
  workerId: string,
  tagId: string
): Promise<{ error: string | null }> {
  const orgId = resolveActiveOrganisationId();
  if (!orgId) {
    return { error: "Select an organisation before removing tags." };
  }

  try {
    const { error } = await supabase
      .from(WORKER_TAGS_TABLE)
      .delete()
      .eq("worker_id", workerId)
      .eq("tag_id", tagId);
    if (error) return { error: error.message };
    return { error: null };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to remove tag.",
    };
  }
}

export async function setWorkerTags(
  workerId: string,
  tagIds: string[]
): Promise<{ error: string | null }> {
  const orgId = resolveActiveOrganisationId();
  if (!orgId) {
    return { error: "Select an organisation before saving worker tags." };
  }

  const uniqueIds = uniqueTagIds(tagIds);

  try {
    const { error: deleteError } = await supabase
      .from(WORKER_TAGS_TABLE)
      .delete()
      .eq("worker_id", workerId);
    if (deleteError) {
      if (isMissingRelationError(deleteError.message, WORKER_TAGS_TABLE)) {
        return { error: "Tags table is not available. Apply migration 184." };
      }
      return { error: deleteError.message };
    }

    return insertWorkerTagAssignments(supabase, workerId, uniqueIds, orgId);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to save worker tags.",
    };
  }
}
