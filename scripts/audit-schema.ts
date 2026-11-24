/**
 * Standalone Supabase schema audit.
 *
 * Compares every .from().select/insert/update/upsert usage in src/
 * against live public information_schema columns.
 *
 * Usage:
 *   npx tsx scripts/audit-schema.ts
 *   npx ts-node --transpile-only scripts/audit-schema.ts
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

type LiveColumnMap = Map<string, Set<string>>;
type LiveTableMeta = Map<string, "BASE TABLE" | "VIEW" | "UNKNOWN">;

type ColumnUse = {
  table: string;
  column: string;
  file: string;
  line: number;
  kind: "select" | "insert" | "update" | "upsert";
};

type TableUse = {
  table: string;
  file: string;
  line: number;
};

type Finding = {
  kind: "table" | "column";
  table: string;
  column?: string;
  file: string;
  line: number;
};

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".jsx"]);

const JSONB_COLUMN_RE =
  /(^|_)(data|metadata|json|payload|answers|slots|urls|photos|attachments|signatures|signoffs|items|checklist|coordinates|markup)$/i;
const BOOL_COLUMN_RE = /^(is_|has_|can_|allow_|enable_|enabled|archived|deleted|required|not_required)/i;
const TIME_COLUMN_RE = /(_at|_date|_time)$/i;
const NUMERIC_COLUMN_RE =
  /(_count|_percent|_mm|_m|_kms|_km|_hours|_hour|_qty|_quantity|_order|_index|_lat|_lng|_x|_y)$/i;

function loadEnvFiles(): void {
  for (const name of [".env.local", ".env"]) {
    const envPath = path.join(ROOT, name);
    if (!existsSync(envPath)) continue;
    for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value.replace(/\r/g, "").trim();
    }
  }
}

function envValue(...keys: string[]): string {
  for (const key of keys) {
    const value = (process.env[key] ?? "").replace(/\r/g, "").trim().replace(/^['"]|['"]$/g, "");
    if (value) return value;
  }
  return "";
}

function createAuditClient(): { client: SupabaseClient; url: string; key: string; keyKind: string } {
  const url = envValue("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL");
  const serviceKey = envValue(
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_KEY",
    "SUPABASE_SECRET_KEY",
    "SERVICE_ROLE_KEY"
  );
  const anonKey = envValue("NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY");
  const key = serviceKey || anonKey;
  if (!url || url.includes("placeholder") || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)."
    );
  }
  return {
    url,
    key,
    keyKind: serviceKey ? "service_role" : "anon",
    client: createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }),
  };
}

function rel(file: string): string {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

function walkSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      files.push(...walkSourceFiles(full));
      continue;
    }
    if (SOURCE_EXT.has(path.extname(entry.name))) files.push(full);
  }
  return files;
}

function lineAt(source: string, index: number): number {
  return source.slice(0, index).split(/\n/).length;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " ")).replace(
    /(^|[^:])\/\/.*$/gm,
    "$1"
  );
}

function collectStringTableConstants(files: string[]): Map<string, string> {
  const constants = new Map<string, string>();
  const re =
    /(?:export\s+)?const\s+([A-Z][A-Z0-9_]*(?:TABLE|TABLES)?[A-Z0-9_]*)\s*(?::\s*[^=]+)?=\s*["'`]([a-z][a-z0-9_]*)["'`]/g;
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(source))) {
      constants.set(match[1], match[2]);
    }
  }
  return constants;
}

function splitTopLevel(value: string, delimiter: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (quote) {
      if (ch === "\\" && quote !== "`") {
        current += ch + (value[i + 1] ?? "");
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      current += ch;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "(" || ch === "{" || ch === "[") depth += 1;
    if (ch === ")" || ch === "}" || ch === "]") depth -= 1;
    if (ch === delimiter && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function unwrapQuoted(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith("`") && trimmed.endsWith("`"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function extractObjectKeys(objectLiteral: string): string[] {
  const body = objectLiteral.trim().replace(/^\{/, "").replace(/\}$/, "");
  const keys: string[] = [];
  for (const part of splitTopLevel(body, ",")) {
    const trimmed = part.trim();
    if (!trimmed || trimmed.startsWith("...") || trimmed.startsWith("/")) continue;
    const named = trimmed.match(/^(?:['"`]([a-zA-Z_][a-zA-Z0-9_]*)['"`]|([a-zA-Z_][a-zA-Z0-9_]*))\s*:/);
    if (named?.[1] || named?.[2]) keys.push((named[1] ?? named[2]) as string);
  }
  return keys;
}

function findMatching(source: string, openIndex: number, open: string, close: string): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === "\\" && quote !== "`") {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === open) depth += 1;
    if (ch === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function firstObjectLiteral(arg: string): string | null {
  const start = arg.indexOf("{");
  if (start < 0) return null;
  const end = findMatching(arg, start, "{", "}");
  if (end < 0) return null;
  return arg.slice(start, end + 1);
}

function findIdentObjectLiteral(
  source: string,
  ident: string,
  beforeIndex: number,
  searchFrom = 0
): string | null {
  const start = Math.max(searchFrom, beforeIndex - 8000);
  const window = source.slice(start, beforeIndex);
  const re = new RegExp(
    `(?:const|let|var)\\s+${ident}\\b[\\s\\S]{0,180}?=\\s*\\{`,
    "g"
  );
  let last: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = re.exec(window))) last = match;
  if (!last) return null;
  const abs = start + (last.index ?? 0);
  const brace = source.indexOf("{", abs);
  if (brace < 0) return null;
  const end = findMatching(source, brace, "{", "}");
  if (end < 0) return null;
  return source.slice(brace, end + 1);
}

function parseSelectColumns(select: string): { columns: string[]; embeds: { table: string; columns: string[] }[] } {
  const columns: string[] = [];
  const embeds: { table: string; columns: string[] }[] = [];
  for (const rawPart of splitTopLevel(select, ",")) {
    const part = rawPart.trim();
    if (!part || part === "*" || part.endsWith(".*")) continue;
    const embed = part.match(
      /^(?:[a-zA-Z_][a-zA-Z0-9_]*\s*:\s*)?([a-zA-Z_][a-zA-Z0-9_]*)(?:!inner)?(?:![a-zA-Z0-9_]+)?\s*\(([\s\S]*)\)$/
    );
    if (embed) {
      const nested = parseSelectColumns(embed[2] ?? "");
      embeds.push({ table: embed[1], columns: nested.columns });
      embeds.push(...nested.embeds);
      continue;
    }
    const cleaned = part
      .replace(/^[\s]+/, "")
      .replace(/::[a-zA-Z0-9_]+$/, "")
      .trim();
    const aliased = cleaned.match(/^(?:[a-zA-Z_][a-zA-Z0-9_]*\s*:\s*)?([a-zA-Z_][a-zA-Z0-9_]*)$/);
    if (aliased?.[1] && aliased[1] !== "count") columns.push(aliased[1]);
  }
  return { columns, embeds };
}

function extractCallArgument(source: string, methodIndex: number): string | null {
  const open = source.indexOf("(", methodIndex);
  if (open < 0) return null;
  const close = findMatching(source, open, "(", ")");
  if (close < 0) return null;
  return source.slice(open + 1, close);
}

function extractMutationColumns(
  source: string,
  methodIndex: number,
  identFallback: (ident: string) => string | null
): string[] {
  const arg = extractCallArgument(source, methodIndex);
  if (!arg) return [];
  const trimmed = arg.trim();
  const keys = new Set<string>();
  if (trimmed.startsWith("{")) {
    const obj = firstObjectLiteral(trimmed);
    if (obj) extractObjectKeys(obj).forEach((key) => keys.add(key));
    return [...keys];
  }
  if (trimmed.startsWith("[")) {
    const close = findMatching(trimmed, 0, "[", "]");
    const body = close >= 0 ? trimmed.slice(1, close) : trimmed.slice(1);
    for (const part of splitTopLevel(body, ",")) {
      const obj = firstObjectLiteral(part);
      if (obj) extractObjectKeys(obj).forEach((key) => keys.add(key));
    }
    return [...keys];
  }
  const ident = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)$/);
  if (ident) {
    const obj = identFallback(ident[1]);
    if (obj) extractObjectKeys(obj).forEach((key) => keys.add(key));
  }
  return [...keys];
}

function extractFromUsages(
  file: string,
  source: string,
  constants: Map<string, string>
): { tables: TableUse[]; columns: ColumnUse[] } {
  const tables: TableUse[] = [];
  const columns: ColumnUse[] = [];
  const cleaned = stripComments(source);
  const fromRe = /\.from\(\s*(?:['"`]([a-zA-Z_][a-zA-Z0-9_]*)['"`]|([A-Z][A-Z0-9_]*))\s*\)/g;
  let match: RegExpExecArray | null;

  while ((match = fromRe.exec(cleaned))) {
    const tokenIndex = match.index;
    const prefix = cleaned.slice(Math.max(0, tokenIndex - 24), tokenIndex);
    if (/\.storage\s*$/.test(prefix) || /storage\s*$/.test(prefix)) continue;

    const table = match[1] || (match[2] ? constants.get(match[2]) : null);
    if (!table) continue;

    const line = lineAt(cleaned, tokenIndex);
    tables.push({ table, file, line });

    const afterFrom = tokenIndex + match[0].length;
    const nextFromRel = cleaned.slice(afterFrom).search(/\.from\s*\(/);
    const windowEnd = nextFromRel >= 0 ? afterFrom + nextFromRel : Math.min(cleaned.length, tokenIndex + 2500);
    const window = cleaned.slice(tokenIndex, windowEnd);
    const methodRe = /\.(select|insert|update|upsert)\s*\(/g;
    let methodMatch: RegExpExecArray | null;
    while ((methodMatch = methodRe.exec(window))) {
      const kind = methodMatch[1] as ColumnUse["kind"];
      const absMethod = tokenIndex + methodMatch.index;
      if (kind === "select") {
        const arg = extractCallArgument(cleaned, absMethod);
        if (!arg) continue;
        const firstArg = splitTopLevel(arg, ",")[0] ?? "";
        const literal = unwrapQuoted(firstArg);
        if (!literal || /^[A-Za-z_][A-Za-z0-9_]*$/.test(firstArg.trim())) continue;
        const parsed = parseSelectColumns(literal);
        for (const column of parsed.columns) {
          columns.push({ table, column, file, line, kind });
        }
        for (const embed of parsed.embeds) {
          tables.push({ table: embed.table, file, line });
          for (const column of embed.columns) {
            columns.push({ table: embed.table, column, file, line, kind });
          }
        }
        continue;
      }
      const keys = extractMutationColumns(cleaned, absMethod, (ident) =>
        findIdentObjectLiteral(cleaned, ident, absMethod, tokenIndex)
      );
      for (const column of keys) {
        columns.push({ table, column, file, line, kind });
      }
    }
  }

  return { tables, columns };
}

async function fetchInformationSchema(
  url: string,
  key: string
): Promise<{ columns: LiveColumnMap; tables: LiveTableMeta } | null> {
  const endpoint = new URL("/rest/v1/columns", url);
  endpoint.searchParams.set("table_schema", "eq.public");
  endpoint.searchParams.set("select", "table_name,column_name");
  endpoint.searchParams.set("limit", "20000");

  const response = await fetch(endpoint, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Accept-Profile": "information_schema",
      "Content-Profile": "information_schema",
    },
  });
  if (!response.ok) return null;
  const rows = (await response.json()) as Array<{ table_name?: string; column_name?: string }>;
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const columns: LiveColumnMap = new Map();
  for (const row of rows) {
    const table = String(row.table_name ?? "").trim();
    const column = String(row.column_name ?? "").trim();
    if (!table || !column) continue;
    const set = columns.get(table) ?? new Set<string>();
    set.add(column);
    columns.set(table, set);
  }

  const tables: LiveTableMeta = new Map();
  const tablesUrl = new URL("/rest/v1/tables", url);
  tablesUrl.searchParams.set("table_schema", "eq.public");
  tablesUrl.searchParams.set("select", "table_name,table_type");
  tablesUrl.searchParams.set("limit", "5000");
  const tableResponse = await fetch(tablesUrl, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Accept-Profile": "information_schema",
      "Content-Profile": "information_schema",
    },
  });
  if (tableResponse.ok) {
    const tableRows = (await tableResponse.json()) as Array<{
      table_name?: string;
      table_type?: string;
    }>;
    for (const row of tableRows) {
      const name = String(row.table_name ?? "").trim();
      if (!name) continue;
      tables.set(name, row.table_type === "VIEW" ? "VIEW" : "BASE TABLE");
    }
  }
  for (const table of columns.keys()) {
    if (!tables.has(table)) tables.set(table, "UNKNOWN");
  }
  return { columns, tables };
}

async function fetchOpenApiSchema(
  url: string,
  key: string
): Promise<{ columns: LiveColumnMap; tables: LiveTableMeta } | null> {
  const response = await fetch(new URL("/rest/v1/", url), {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/openapi+json",
    },
  });
  if (!response.ok) return null;
  const spec = (await response.json()) as {
    definitions?: Record<string, { properties?: Record<string, unknown> }>;
    components?: { schemas?: Record<string, { properties?: Record<string, unknown> }> };
  };
  const schemas = spec.definitions ?? spec.components?.schemas ?? {};
  const columns: LiveColumnMap = new Map();
  const tables: LiveTableMeta = new Map();
  for (const [name, schema] of Object.entries(schemas)) {
    if (name.includes(" ") || !/^[a-z][a-z0-9_]*$/.test(name)) continue;
    const props = schema?.properties ?? {};
    const set = new Set(Object.keys(props));
    if (set.size === 0) continue;
    columns.set(name, set);
    tables.set(name, "UNKNOWN");
  }
  return columns.size ? { columns, tables } : null;
}

async function loadLiveSchema(
  client: SupabaseClient,
  url: string,
  key: string
): Promise<{ columns: LiveColumnMap; tables: LiveTableMeta; source: string }> {
  const viaRest = await fetchInformationSchema(url, key);
  if (viaRest) return { ...viaRest, source: "information_schema.columns" };

  try {
    const { data, error } = await client
      .schema("information_schema")
      .from("columns")
      .select("table_name, column_name")
      .eq("table_schema", "public");
    if (!error && Array.isArray(data) && data.length > 0) {
      const columns: LiveColumnMap = new Map();
      for (const row of data as Array<{ table_name?: string; column_name?: string }>) {
        const table = String(row.table_name ?? "").trim();
        const column = String(row.column_name ?? "").trim();
        if (!table || !column) continue;
        const set = columns.get(table) ?? new Set<string>();
        set.add(column);
        columns.set(table, set);
      }
      const tables: LiveTableMeta = new Map();
      for (const table of columns.keys()) tables.set(table, "UNKNOWN");
      return { columns, tables, source: "information_schema.columns (supabase-js)" };
    }
  } catch {
    // Fall through to OpenAPI.
  }

  const openApi = await fetchOpenApiSchema(url, key);
  if (openApi) return { ...openApi, source: "PostgREST OpenAPI schema cache" };

  throw new Error(
    "Unable to read live schema. information_schema is not exposed and OpenAPI fallback failed."
  );
}

function inferColumnType(column: string): string {
  if (BOOL_COLUMN_RE.test(column)) return "boolean";
  if (TIME_COLUMN_RE.test(column)) return "timestamptz";
  if (JSONB_COLUMN_RE.test(column) || column === "photos" || column === "form_data") return "jsonb";
  if (NUMERIC_COLUMN_RE.test(column)) return "numeric";
  return "text";
}

function mergeSchema(
  target: { columns: LiveColumnMap; tables: LiveTableMeta },
  extra: { columns: LiveColumnMap; tables: LiveTableMeta }
): void {
  for (const [table, type] of extra.tables) {
    if (!target.tables.has(table)) target.tables.set(table, type);
  }
  for (const [table, cols] of extra.columns) {
    const set = target.columns.get(table) ?? new Set<string>();
    for (const col of cols) set.add(col);
    target.columns.set(table, set);
    if (!target.tables.has(table)) target.tables.set(table, "BASE TABLE");
  }
}

function loadDeclaredSchemaFromMigrations(): { columns: LiveColumnMap; tables: LiveTableMeta } {
  const columns: LiveColumnMap = new Map();
  const tables: LiveTableMeta = new Map();
  if (!existsSync(MIGRATIONS_DIR)) return { columns, tables };

  const addColumn = (table: string, column: string) => {
    if (!/^[a-z][a-z0-9_]*$/.test(table) || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column)) return;
    if (["CONSTRAINT", "PRIMARY", "UNIQUE", "CHECK", "FOREIGN", "LIKE"].includes(column.toUpperCase())) {
      return;
    }
    const set = columns.get(table) ?? new Set<string>();
    set.add(column);
    columns.set(table, set);
    tables.set(table, "BASE TABLE");
  };

  for (const name of readdirSync(MIGRATIONS_DIR)) {
    if (!name.endsWith(".sql")) continue;
    const sql = readFileSync(path.join(MIGRATIONS_DIR, name), "utf8");
    const createRe = /CREATE TABLE(?: IF NOT EXISTS)?\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gi;
    let createMatch: RegExpExecArray | null;
    while ((createMatch = createRe.exec(sql))) {
      const table = createMatch[1].toLowerCase();
      const open = createMatch.index + createMatch[0].length - 1;
      const close = findMatching(sql, open, "(", ")");
      if (close < 0) continue;
      const body = sql.slice(open + 1, close);
      for (const part of splitTopLevel(body, ",")) {
        const first = part.trim().split(/\s+/)[0]?.replace(/["`]/g, "");
        if (first) addColumn(table, first);
      }
    }

    const addRe =
      /ALTER TABLE(?: IF EXISTS)?\s+(?:ONLY\s+)?(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)[\s\S]{0,80}?ADD COLUMN(?: IF NOT EXISTS)?\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi;
    let addMatch: RegExpExecArray | null;
    while ((addMatch = addRe.exec(sql))) {
      addColumn(addMatch[1].toLowerCase(), addMatch[2]);
    }
  }

  return { columns, tables };
}

function nextMigrationPath(): string {
  let max = 0;
  if (existsSync(MIGRATIONS_DIR)) {
    for (const name of readdirSync(MIGRATIONS_DIR)) {
      const match = name.match(/^(\d+)_/);
      if (match) max = Math.max(max, Number(match[1]));
    }
  }
  const next = String(max + 1).padStart(3, "0");
  return path.join(MIGRATIONS_DIR, `${next}_comprehensive_schema_patch.sql`);
}

function buildPatchSql(findings: Finding[], tables: LiveTableMeta): string {
  const missingColumns = new Map<string, Set<string>>();
  for (const finding of findings) {
    if (finding.kind !== "column" || !finding.column) continue;
    if (tables.get(finding.table) === "VIEW") continue;
    if (!tables.has(finding.table)) continue;
    const set = missingColumns.get(finding.table) ?? new Set<string>();
    set.add(finding.column);
    missingColumns.set(finding.table, set);
  }

  const lines = [
    "-- Comprehensive schema patch generated by scripts/audit-schema.ts",
    "-- Adds only columns referenced in src/ that are missing from live public tables.",
    "-- Review types before applying in the Supabase SQL Editor.",
    "",
  ];

  for (const table of [...missingColumns.keys()].sort()) {
    const cols = [...(missingColumns.get(table) ?? [])].sort();
    lines.push(`-- ${table}`);
    for (const column of cols) {
      lines.push(
        `ALTER TABLE public.${table} ADD COLUMN IF NOT EXISTS ${column} ${inferColumnType(column)};`
      );
    }
    lines.push("");
  }

  lines.push("NOTIFY pgrst, 'reload schema';");
  lines.push("");
  return lines.join("\n");
}

function printReport(
  findings: Finding[],
  verifiedTables: number,
  verifiedColumns: number,
  source: string,
  keyKind: string
): void {
  console.log("\n=== SiteBolt Supabase schema audit ===\n");
  console.log(`Live schema source: ${source}`);
  console.log(`Client key: ${keyKind}\n`);

  const tables = findings.filter((item) => item.kind === "table");
  const columns = findings.filter((item) => item.kind === "column");

  if (tables.length === 0 && columns.length === 0) {
    console.log("No missing tables or columns found.\n");
  } else {
    for (const finding of tables) {
      console.log(`❌ Missing Table: ${finding.table} (called in ${finding.file}:${finding.line})`);
    }
    for (const finding of columns) {
      console.log(
        `❌ Missing Column: ${finding.table}.${finding.column} (queried/written in ${finding.file}:${finding.line})`
      );
    }
    console.log("");
  }

  console.log(`✅ Passed: ${verifiedTables} verified tables, ${verifiedColumns} verified columns`);
  console.log(`❌ Failed: ${tables.length} missing tables, ${columns.length} missing column references\n`);
}

async function main(): Promise<void> {
  loadEnvFiles();
  const { client, url, key, keyKind } = createAuditClient();
  const live = await loadLiveSchema(client, url, key);
  const declared = loadDeclaredSchemaFromMigrations();
  mergeSchema(live, declared);
  live.source = `${live.source} + local supabase/migrations`;

  const files = walkSourceFiles(SRC_DIR);
  const constants = collectStringTableConstants(files);
  const tableUses: TableUse[] = [];
  const columnUses: ColumnUse[] = [];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const extracted = extractFromUsages(file, source, constants);
    tableUses.push(...extracted.tables);
    columnUses.push(...extracted.columns);
  }

  const uniqueTables = new Set(tableUses.map((item) => item.table));
  const uniqueColumns = new Set(columnUses.map((item) => `${item.table}.${item.column}`));
  const findings: Finding[] = [];
  const seen = new Set<string>();

  for (const use of tableUses) {
    if (live.columns.has(use.table) || live.tables.has(use.table)) continue;
    const keyName = `table:${use.table}:${use.file}:${use.line}`;
    if (seen.has(keyName)) continue;
    seen.add(keyName);
    findings.push({ kind: "table", table: use.table, file: rel(use.file), line: use.line });
  }

  for (const use of columnUses) {
    if (!live.columns.has(use.table) && !live.tables.has(use.table)) continue;
    const liveCols = live.columns.get(use.table);
    if (liveCols?.has(use.column)) continue;
    const keyName = `column:${use.table}.${use.column}:${use.file}:${use.line}`;
    if (seen.has(keyName)) continue;
    seen.add(keyName);
    findings.push({
      kind: "column",
      table: use.table,
      column: use.column,
      file: rel(use.file),
      line: use.line,
    });
  }

  findings.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "table" ? -1 : 1;
    return `${a.table}.${a.column ?? ""}`.localeCompare(`${b.table}.${b.column ?? ""}`);
  });

  const missingTableNames = new Set(findings.filter((item) => item.kind === "table").map((item) => item.table));
  const missingColumnNames = new Set(
    findings.filter((item) => item.kind === "column").map((item) => `${item.table}.${item.column}`)
  );
  const verifiedTables = [...uniqueTables].filter((table) => !missingTableNames.has(table)).length;
  const verifiedColumns = [...uniqueColumns].filter((column) => !missingColumnNames.has(column)).length;

  printReport(findings, verifiedTables, verifiedColumns, live.source, keyKind);

  const columnFindings = findings.filter((item) => item.kind === "column" && live.tables.has(item.table));
  if (columnFindings.length === 0) {
    console.log("No migration generated (no missing columns on existing tables).");
    return;
  }

  const sql = buildPatchSql(columnFindings, live.tables);
  if (!sql.includes("ADD COLUMN")) {
    console.log("No migration generated (missing columns were on views or unknown relations).");
    return;
  }

  mkdirSync(MIGRATIONS_DIR, { recursive: true });
  const migrationPath = nextMigrationPath();
  writeFileSync(migrationPath, sql, "utf8");
  console.log(`Wrote consolidation SQL: ${rel(migrationPath)}\n`);
  console.log(sql);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
