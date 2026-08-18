import { isSupabaseConfigured, supabase } from "./supabase";

export type CompanyProfileSource = "company_profile" | "organisations";

export const DEFAULT_COMPANY_PROFILE_ID = "00000000-0000-0000-0000-000000000001";

export interface CompanyProfileRecord {
  id: string;
  company_name: string | null;
  trading_name: string | null;
  abn: string | null;
  acn: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  logo_url: string | null;
  updated_at?: string;
  source: CompanyProfileSource;
}

export interface CompanyProfileInput {
  company_name: string;
  trading_name?: string;
  abn?: string;
  acn?: string;
  phone?: string;
  email?: string;
  address?: string;
  suburb?: string;
  state?: string;
  postcode?: string;
}

type ProfileTable = CompanyProfileSource;

type RawProfileRow = Record<string, unknown> & {
  id?: string;
  company_name?: string | null;
  trading_name?: string | null;
  name?: string | null;
  abn?: string | null;
  acn?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
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

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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
    company_name: trimOrNull(row.company_name) || trimOrNull(row.name),
    trading_name: trimOrNull(row.trading_name),
    abn: trimOrNull(row.abn),
    acn: trimOrNull(row.acn),
    phone: trimOrNull(row.phone),
    email: trimOrNull(row.email),
    address: trimOrNull(row.address),
    suburb: trimOrNull(row.suburb),
    state: trimOrNull(row.state),
    postcode: trimOrNull(row.postcode),
    logo_url: logo || null,
    updated_at: row.updated_at,
    source,
  };
}

async function fetchRawProfileRowById(
  table: ProfileTable,
  id: string
): Promise<RawProfileRow | null> {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (!isMissingTableError(error.message, table)) {
      console.error(`Failed to fetch ${table} by id:`, error.message);
    }
    return null;
  }

  return (data as RawProfileRow | null) ?? null;
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

async function resolveExistingProfileTarget(): Promise<{
  table: ProfileTable;
  id: string;
} | null> {
  const primaryByDefaultId = await fetchRawProfileRowById(
    "company_profile",
    DEFAULT_COMPANY_PROFILE_ID
  );
  if (primaryByDefaultId?.id) {
    return { table: "company_profile", id: String(primaryByDefaultId.id) };
  }

  const primaryRow = await fetchRawProfileRow("company_profile");
  if (primaryRow?.id) {
    return { table: "company_profile", id: String(primaryRow.id) };
  }

  const fallbackByDefaultId = await fetchRawProfileRowById(
    "organisations",
    DEFAULT_COMPANY_PROFILE_ID
  );
  if (fallbackByDefaultId?.id) {
    return { table: "organisations", id: String(fallbackByDefaultId.id) };
  }

  const fallbackRow = await fetchRawProfileRow("organisations");
  if (fallbackRow?.id) {
    return { table: "organisations", id: String(fallbackRow.id) };
  }

  return null;
}

function buildProfilePayload(input: CompanyProfileInput): Record<string, unknown> {
  return {
    company_name: input.company_name.trim(),
    trading_name: trimOrNull(input.trading_name),
    abn: trimOrNull(input.abn),
    acn: trimOrNull(input.acn),
    phone: trimOrNull(input.phone),
    email: trimOrNull(input.email),
    address: trimOrNull(input.address),
    suburb: trimOrNull(input.suburb),
    state: trimOrNull(input.state),
    postcode: trimOrNull(input.postcode),
    updated_at: new Date().toISOString(),
  };
}

export async function loadCompanyProfile(): Promise<CompanyProfileRecord | null> {
  const primaryByDefaultId = await fetchRawProfileRowById(
    "company_profile",
    DEFAULT_COMPANY_PROFILE_ID
  );
  const primaryRow = primaryByDefaultId ?? (await fetchRawProfileRow("company_profile"));

  if (primaryRow?.id) {
    const profile = normalizeProfileRow(primaryRow, "company_profile");
    if (!profile.logo_url) {
      const fallbackRow =
        (await fetchRawProfileRowById("organisations", DEFAULT_COMPANY_PROFILE_ID)) ??
        (await fetchRawProfileRow("organisations"));
      const fallbackLogo = resolveCompanyLogoUrl(fallbackRow);
      if (fallbackLogo) {
        profile.logo_url = fallbackLogo;
      }
    }
    return profile;
  }

  const fallbackRow =
    (await fetchRawProfileRowById("organisations", DEFAULT_COMPANY_PROFILE_ID)) ??
    (await fetchRawProfileRow("organisations"));
  if (fallbackRow?.id) {
    return normalizeProfileRow(fallbackRow, "organisations");
  }

  return null;
}

async function writeProfileRow(
  table: ProfileTable,
  id: string,
  payload: Record<string, unknown>
): Promise<{ row: RawProfileRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from(table)
    .update(payload)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    return { row: null, error: error.message };
  }

  return { row: (data as RawProfileRow | null) ?? null, error: null };
}

async function insertProfileRowWithReturn(
  table: ProfileTable,
  payload: Record<string, unknown>
): Promise<{ row: RawProfileRow | null; error: string | null }> {
  const { data, error } = await supabase.from(table).insert([payload]).select("*").maybeSingle();

  if (error) {
    return { row: null, error: error.message };
  }

  return { row: (data as RawProfileRow | null) ?? null, error: null };
}

export async function saveCompanyProfile(input: CompanyProfileInput): Promise<{
  profile: CompanyProfileRecord | null;
  error: string | null;
}> {
  if (!isSupabaseConfigured()) {
    return { profile: null, error: "Supabase is not configured." };
  }

  const payload = buildProfilePayload(input);
  const existing = await resolveExistingProfileTarget();

  if (existing) {
    const { row, error } = await writeProfileRow(existing.table, existing.id, payload);
    if (error) {
      return { profile: null, error };
    }
    if (!row?.id) {
      return { profile: null, error: "Company profile update returned no record." };
    }
    return { profile: normalizeProfileRow(row, existing.table), error: null };
  }

  const insertPrimary = await insertProfileRowWithReturn("company_profile", {
    id: DEFAULT_COMPANY_PROFILE_ID,
    ...payload,
  });
  if (!insertPrimary.error && insertPrimary.row?.id) {
    return {
      profile: normalizeProfileRow(insertPrimary.row, "company_profile"),
      error: null,
    };
  }

  const insertFallback = await insertProfileRowWithReturn("organisations", {
    id: DEFAULT_COMPANY_PROFILE_ID,
    ...payload,
  });
  if (!insertFallback.error && insertFallback.row?.id) {
    return {
      profile: normalizeProfileRow(insertFallback.row, "organisations"),
      error: null,
    };
  }

  return {
    profile: null,
    error:
      insertFallback.error ??
      insertPrimary.error ??
      "Failed to save company profile.",
  };
}

function buildLogoPayload(logoUrl: string | null): Record<string, string | null> {
  return {
    logo_url: logoUrl,
    company_logo: logoUrl,
  };
}

export async function saveCompanyLogoUrl(
  logoUrl: string | null
): Promise<{ profile: CompanyProfileRecord | null; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { profile: null, error: "Supabase is not configured." };
  }

  const logoPayload = buildLogoPayload(logoUrl);
  const existing = await resolveExistingProfileTarget();

  if (existing) {
    const { row, error } = await writeProfileRow(existing.table, existing.id, logoPayload);
    if (error) {
      return { profile: null, error };
    }
    if (!row?.id) {
      return { profile: null, error: "Company logo update returned no record." };
    }
    return { profile: normalizeProfileRow(row, existing.table), error: null };
  }

  const insertPrimary = await insertProfileRowWithReturn("company_profile", {
    id: DEFAULT_COMPANY_PROFILE_ID,
    company_name: "My Company",
    ...logoPayload,
  });
  if (!insertPrimary.error && insertPrimary.row?.id) {
    return {
      profile: normalizeProfileRow(insertPrimary.row, "company_profile"),
      error: null,
    };
  }

  const insertFallback = await insertProfileRowWithReturn("organisations", {
    id: DEFAULT_COMPANY_PROFILE_ID,
    company_name: "My Company",
    ...logoPayload,
  });
  if (!insertFallback.error && insertFallback.row?.id) {
    return {
      profile: normalizeProfileRow(insertFallback.row, "organisations"),
      error: null,
    };
  }

  return {
    profile: null,
    error:
      insertFallback.error ??
      insertPrimary.error ??
      "Failed to save company logo.",
  };
}
