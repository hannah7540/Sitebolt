import { createBrowserClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "./env";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

function createSafeAuthStorage() {
  const memory = new Map<string, string>();

  const webStore = (() => {
    if (typeof window === "undefined") return null;
    try {
      const probe = "__sitebolt_auth_probe__";
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
      return window.localStorage;
    } catch {
      try {
        const probe = "__sitebolt_auth_probe__";
        window.sessionStorage.setItem(probe, "1");
        window.sessionStorage.removeItem(probe);
        return window.sessionStorage;
      } catch {
        return null;
      }
    }
  })();

  return {
    getItem(key: string) {
      try {
        return webStore?.getItem(key) ?? memory.get(key) ?? null;
      } catch {
        return memory.get(key) ?? null;
      }
    },
    setItem(key: string, value: string) {
      memory.set(key, value);
      try {
        webStore?.setItem(key, value);
      } catch {
        // WebView storage can be blocked; keep the in-memory copy.
      }
    },
    removeItem(key: string) {
      memory.delete(key);
      try {
        webStore?.removeItem(key);
      } catch {
        // Ignore sandbox storage failures.
      }
    },
  };
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
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storage: createSafeAuthStorage(),
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
