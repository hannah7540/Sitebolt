import { isSupabaseConfigured, supabase } from "./supabase";

export type CompanyProfileSource = "company_profile" | "organisations";

export interface CompanyProfileRecord {
  id: string;
  company_name: string | null;
  abn: string | null;
  address: string | null;
  logo_url: string | null;
  updated_at?: string;
  source: CompanyProfileSource;
}

type ProfileTable = CompanyProfileSource;

type RawProfileRow = Record<string, unknown> & {
  id?: string;
  company_name?: string | null;
  name?: string | null;
  abn?: string | null;
  address?: string | null;
  logo_url?: string | null;
  company_logo?: string | null;
  updated_at?: string;
};

function isMissingTableError(message: string, table: ProfileTable): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes(table) ||
    lower.includes("does not exist") ||
    lower.includes("schema cache")
  );
}

export function resolveCompanyLogoUrl(
  data:
    | {
        logo_url?: string | null;
        company_logo?: string | null;
      }
    | null
    | undefined
): string {
  if (!data) return "";
  return String(data.logo_url || data.company_logo || "").trim();
}

function normalizeProfileRow(
  row: RawProfileRow,
  source: ProfileTable
): CompanyProfileRecord {
  const logo = resolveCompanyLogoUrl(row);
  return {
    id: String(row.id),
    company_name: row.company_name?.trim() || row.name?.trim() || null,
    abn: row.abn?.trim() || null,
    address: row.address?.trim() || null,
    logo_url: logo || null,
    updated_at: row.updated_at,
    source,
  };
}

async function fetchRawProfileRow(
  table: ProfileTable
): Promise<RawProfileRow | null> {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await supabase.from(table).select("*").limit(1).maybeSingle();

  if (error) {
    if (!isMissingTableError(error.message, table)) {
      console.error(`Failed to fetch ${table}:`, error.message);
    }
    return null;
  }

  return (data as RawProfileRow | null) ?? null;
}

export async function loadCompanyProfile(): Promise<CompanyProfileRecord | null> {
  const primaryRow = await fetchRawProfileRow("company_profile");
  if (primaryRow?.id) {
    const profile = normalizeProfileRow(primaryRow, "company_profile");
    if (!profile.logo_url) {
      const fallbackRow = await fetchRawProfileRow("organisations");
      const fallbackLogo = resolveCompanyLogoUrl(fallbackRow);
      if (fallbackLogo) {
        profile.logo_url = fallbackLogo;
      }
    }
    return profile;
  }

  const fallbackRow = await fetchRawProfileRow("organisations");
  if (fallbackRow?.id) {
    return normalizeProfileRow(fallbackRow, "organisations");
  }

  return null;
}

async function updateProfileRow(
  table: ProfileTable,
  id: string,
  payload: Record<string, unknown>
): Promise<string | null> {
  const { error } = await supabase
    .from(table)
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  return error?.message ?? null;
}

async function insertProfileRow(
  table: ProfileTable,
  payload: Record<string, unknown>
): Promise<string | null> {
  const { error } = await supabase.from(table).insert([payload]);
  return error?.message ?? null;
}

export async function saveCompanyProfile(input: {
  company_name: string;
  abn: string;
  address: string;
}): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  const payload = {
    company_name: input.company_name.trim(),
    abn: input.abn.trim(),
    address: input.address.trim(),
  };

  const primaryRow = await fetchRawProfileRow("company_profile");
  if (primaryRow?.id) {
    const error = await updateProfileRow("company_profile", String(primaryRow.id), payload);
    if (!error) return { error: null };
  }

  const fallbackRow = await fetchRawProfileRow("organisations");
  if (fallbackRow?.id) {
    const error = await updateProfileRow("organisations", String(fallbackRow.id), payload);
    return { error };
  }

  const insertPrimaryError = await insertProfileRow("company_profile", payload);
  if (!insertPrimaryError) return { error: null };

  const insertFallbackError = await insertProfileRow("organisations", payload);
  return { error: insertFallbackError ?? insertPrimaryError };
}

function buildLogoPayload(logoUrl: string | null): Record<string, string | null> {
  return {
    logo_url: logoUrl,
    company_logo: logoUrl,
  };
}

export async function saveCompanyLogoUrl(
  logoUrl: string | null
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  const logoPayload = buildLogoPayload(logoUrl);

  const primaryRow = await fetchRawProfileRow("company_profile");
  if (primaryRow?.id) {
    const error = await updateProfileRow(
      "company_profile",
      String(primaryRow.id),
      logoPayload
    );
    if (!error) return { error: null };
  }

  const fallbackRow = await fetchRawProfileRow("organisations");
  if (fallbackRow?.id) {
    const error = await updateProfileRow(
      "organisations",
      String(fallbackRow.id),
      logoPayload
    );
    return { error };
  }

  const insertPrimaryError = await insertProfileRow("company_profile", {
    company_name: "My Company",
    ...logoPayload,
  });
  if (!insertPrimaryError) return { error: null };

  const insertFallbackError = await insertProfileRow("organisations", {
    company_name: "My Company",
    ...logoPayload,
  });
  return { error: insertFallbackError ?? insertPrimaryError };
}
