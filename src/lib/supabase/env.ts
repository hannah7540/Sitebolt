const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export { supabaseAnonKey, supabaseUrl };

export function readSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? supabaseUrl;
}

export function readSupabaseAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? supabaseAnonKey;
}

export function isSupabaseConfigured(): boolean {
  const url = readSupabaseUrl();
  const anonKey = readSupabaseAnonKey();
  return (
    url.length > 0 &&
    anonKey.length > 0 &&
    !url.includes("YOUR_SUPABASE") &&
    anonKey !== "YOUR_SUPABASE_ANON_KEY"
  );
}

export function getServiceRoleKey(): string {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "")
    .replace(/\r/g, "")
    .trim();
}

export function isSupabaseAdminConfigured(): boolean {
  return isSupabaseConfigured() && getServiceRoleKey().length > 0;
}

/** Public site origin for Supabase auth redirect URLs. */
export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;

  return "http://localhost:3000";
}
