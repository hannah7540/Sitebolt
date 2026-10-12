import { parse, serialize, type SerializeOptions } from "cookie";
import { createBrowserClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "./env";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

const AUTH_COOKIE_BACKUP_KEY = "sitebolt_auth_cookie_backup";
const memoryCookieBackup = new Map<string, string>();

type StoredAuthCookie = { name: string; value: string };

function rememberAuthCookies(cookies: StoredAuthCookie[]): void {
  memoryCookieBackup.clear();
  for (const cookie of cookies) {
    if (cookie.value) memoryCookieBackup.set(cookie.name, cookie.value);
  }
  if (typeof window === "undefined") return;
  try {
    if (cookies.length === 0) {
      window.localStorage.removeItem(AUTH_COOKIE_BACKUP_KEY);
      return;
    }
    window.localStorage.setItem(AUTH_COOKIE_BACKUP_KEY, JSON.stringify(cookies));
  } catch {
    // WebView storage can be blocked; the in-memory copy still serves this session.
  }
}

function readAuthCookieBackup(): StoredAuthCookie[] {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(AUTH_COOKIE_BACKUP_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          const stored = parsed.filter(
            (entry): entry is StoredAuthCookie =>
              Boolean(entry) &&
              typeof entry === "object" &&
              typeof (entry as StoredAuthCookie).name === "string" &&
              typeof (entry as StoredAuthCookie).value === "string" &&
              Boolean((entry as StoredAuthCookie).value)
          );
          if (stored.length > 0) {
            rememberAuthCookies(stored);
            return stored;
          }
        }
      }
    } catch {
      // Fall through to the in-memory session copy.
    }
  }

  return [...memoryCookieBackup.entries()].map(([name, value]) => ({ name, value }));
}

function readDocumentCookies(): StoredAuthCookie[] {
  if (typeof document === "undefined") return [];
  const parsed = parse(document.cookie);
  return Object.entries(parsed)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== "")
    .map(([name, value]) => ({ name, value }));
}

/**
 * Android WebView often drops chunked Supabase cookies. Keep a complete copy
 * and fill any chunks document.cookie lost so the access token still resolves.
 */
function readMergedAuthCookies(): StoredAuthCookie[] {
  const fromDocument = readDocumentCookies();
  const fromBackup = readAuthCookieBackup();
  const documentNames = new Set(fromDocument.map((cookie) => cookie.name));
  const backupHasMissingChunk = fromBackup.some((cookie) => !documentNames.has(cookie.name));
  if (!backupHasMissingChunk) return fromDocument;

  const merged = new Map(fromDocument.map((cookie) => [cookie.name, cookie.value]));
  for (const cookie of fromBackup) {
    if (!merged.has(cookie.name)) merged.set(cookie.name, cookie.value);
  }
  return [...merged.entries()].map(([name, value]) => ({ name, value }));
}

function persistBrowserAuthCookies(
  cookiesToSet: { name: string; value: string; options: SerializeOptions }[]
): void {
  const backup = new Map(readAuthCookieBackup().map((cookie) => [cookie.name, cookie.value]));
  for (const { name, value, options } of cookiesToSet) {
    try {
      if (typeof document !== "undefined") {
        document.cookie = serialize(name, value, options);
      }
    } catch {
      // Oversized WebView cookies are still kept in the backup below.
    }
    if (!value || options.maxAge === 0) backup.delete(name);
    else backup.set(name, value);
  }
  rememberAuthCookies([...backup.entries()].map(([name, value]) => ({ name, value })));
}

function createServerFallbackClient(): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    db: { schema: "public" },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function createSupabaseBrowserClient() {
  if (typeof window === "undefined") {
    return createServerFallbackClient();
  }

  if (!browserClient) {
    try {
      browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey, {
        db: { schema: "public" },
        cookies: {
          getAll() {
            return readMergedAuthCookies();
          },
          setAll(cookiesToSet) {
            persistBrowserAuthCookies(cookiesToSet);
          },
        },
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      });
    } catch (cause) {
      console.error("Supabase browser client init failed:", cause);
      return createServerFallbackClient();
    }
  }

  return browserClient;
}

/** Lazy singleton so server builds/API routes do not require browser cookie APIs. */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, property, receiver) {
    const client = createSupabaseBrowserClient();
    const value = Reflect.get(client, property, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
