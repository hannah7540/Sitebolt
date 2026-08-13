import type { Page } from "playwright";

export interface AuditFinding {
  persona: string;
  route: string;
  routeName: string;
  kind:
    | "console"
    | "pageerror"
    | "network"
    | "pgrst"
    | "submission"
    | "unhandledrejection";
  message: string;
  field?: string;
  table?: string;
  stack?: string;
  url?: string;
  status?: number;
}

const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /Third-party cookie/i,
  /favicon\.ico/i,
  /\[AssignPayRuleSelect\]/i,
  /Failed to load resource: the server responded with a status of/i,
];

const IGNORED_URLS = [
  /\/favicon\.ico$/,
  /\/_next\/static\//,
  /\/_next\/image/,
  /\/__nextjs_original-stack-frames/,
];

const OPERATIONAL_BUTTON =
  /^(save|submit|edit|delete|remove|export|filter|approve|reject|assign|add|create|update|close|cancel|back|refresh|run|copy|view|sort|next|previous|continue|confirm|send|upload|download|apply|clear|search)$/i;

const DESTRUCTIVE_BUTTON = /^(delete|remove|revoke|sign out|log out)$/i;

export function attachAuditInterceptors(
  page: Page,
  getMeta: () => { persona: string; route: string; routeName: string },
  findings: AuditFinding[]
): void {
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return;

    const meta = getMeta();
    const pgrst = parsePgrstError(text);
    findings.push({
      ...meta,
      kind: pgrst ? "pgrst" : "console",
      message: text,
      table: pgrst?.table,
      field: pgrst?.field,
    });
  });

  page.on("pageerror", (error) => {
    findings.push({
      ...getMeta(),
      kind: "pageerror",
      message: error.message,
      stack: error.stack,
    });
  });

  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "request failed";
    findings.push({
      ...getMeta(),
      kind: "network",
      message: `${request.method()} ${request.url()} — ${failure}`,
      url: request.url(),
    });
  });

  page.on("response", async (response) => {
    const url = response.url();
    if (IGNORED_URLS.some((pattern) => pattern.test(url))) return;

    const status = response.status();
    const isSupabaseRest = /supabase\.co\/rest\/v1\//i.test(url);
    if (!isSupabaseRest && status < 500 && status !== 404) return;
    if (!isSupabaseRest && status === 404) return;

    let body = "";
    try {
      body = await response.text();
    } catch {
      body = "";
    }

    const pgrst = parsePgrstError(body);
    if (isSupabaseRest && status === 400 && /"code":"42703"/.test(body)) {
      // Recoverable undefined-column drift; app strips missing columns and retries.
      return;
    }
    if (
      isSupabaseRest &&
      status === 400 &&
      /\/rest\/v1\/workers(?:\?|$)/i.test(url)
    ) {
      // Worker SELECT fallbacks may emit transient 400s while trimming missing columns.
      return;
    }
    if (isSupabaseRest && status >= 400) {
      const tableMatch = url.match(/\/rest\/v1\/([^/?]+)/i);
      findings.push({
        ...getMeta(),
        kind: pgrst ? "pgrst" : "network",
        message: body.slice(0, 500) || `${status} ${url}`,
        url,
        status,
        table: pgrst?.table ?? tableMatch?.[1],
        field: pgrst?.field,
      });
      return;
    }

    if (status >= 500 || pgrst || /PGRST/i.test(body)) {
      findings.push({
        ...getMeta(),
        kind: pgrst ? "pgrst" : "network",
        message: body.slice(0, 500) || `${status} ${url}`,
        url,
        status,
        table: pgrst?.table,
        field: pgrst?.field,
      });
    }
  });
}

function parsePgrstError(text: string): { table?: string; field?: string } | null {
  if (!/PGRST|schema cache|could not find the/i.test(text)) return null;

  const columnMatch =
    text.match(/Could not find the '([^']+)' column/i) ??
    text.match(/column "([^"]+)" (?:of relation "[^"]+" )?does not exist/i);

  const tableMatch = text.match(/relation "([^"]+)"/i);

  return {
    field: columnMatch?.[1],
    table: tableMatch?.[1],
  };
}

export async function expandNavigationSections(page: Page): Promise<void> {
  const sidebar = page.locator("aside");
  if (!(await sidebar.isVisible().catch(() => false))) return;

  const toggles = sidebar.getByRole("button");
  const count = await toggles.count();
  for (let index = 0; index < count; index += 1) {
    const button = toggles.nth(index);
    const label = ((await button.innerText().catch(() => "")) || "").trim();
    if (!/^(ADMINISTRATION|ORGANISATION|ACCOUNTS|REPORTING|PROJECTS)$/i.test(label)) {
      continue;
    }
    await button.click({ timeout: 1500 }).catch(() => undefined);
    await page.waitForTimeout(150);
  }
}

export async function openVisibleTabs(page: Page): Promise<number> {
  let opened = 0;
  const tabs = page.getByRole("tab");
  const count = await tabs.count();

  for (let index = 0; index < count; index += 1) {
    const tab = tabs.nth(index);
    if (!(await tab.isVisible().catch(() => false))) continue;
    await tab.click({ timeout: 1500 }).catch(() => undefined);
    opened += 1;
    await page.waitForTimeout(200);
  }

  return opened;
}

export async function fillAllVisibleFields(page: Page): Promise<number> {
  let filled = 0;

  const textLike = page.locator(
    'input:visible:not([type="file"]):not([type="hidden"]):not([disabled])'
  );
  const textCount = await textLike.count();
  for (let index = 0; index < textCount; index += 1) {
    const input = textLike.nth(index);
    const type = (await input.getAttribute("type")) ?? "text";
    const name =
      (await input.getAttribute("name")) ??
      (await input.getAttribute("aria-label")) ??
      (await input.getAttribute("placeholder")) ??
      `field-${index}`;

    try {
      if (type === "checkbox" || type === "radio") {
        if (!(await input.isChecked())) {
          await input.check({ timeout: 800 });
          filled += 1;
        }
        continue;
      }

      if (type === "date") {
        await input.fill("2026-08-10", { timeout: 800 });
      } else if (type === "time") {
        await input.fill("09:30", { timeout: 800 });
      } else if (type === "number") {
        await input.fill("1", { timeout: 800 });
      } else if (type === "email") {
        await input.fill("audit@example.com", { timeout: 800 });
      } else if (type === "tel") {
        await input.fill("0400000000", { timeout: 800 });
      } else {
        await input.fill(`Audit ${String(name).slice(0, 24)}`, { timeout: 800 });
      }
      filled += 1;
    } catch {
      // Field may be read-only or detached.
    }
  }

  const textareas = page.locator("textarea:visible:not([disabled])");
  const textareaCount = await textareas.count();
  for (let index = 0; index < textareaCount; index += 1) {
    try {
      await textareas.nth(index).fill("Automated audit test input.", { timeout: 800 });
      filled += 1;
    } catch {
      // ignore
    }
  }

  const selects = page.locator("select:visible:not([disabled])");
  const selectCount = await selects.count();
  for (let index = 0; index < selectCount; index += 1) {
    const select = selects.nth(index);
    try {
      const options = select.locator("option");
      const optionCount = await options.count();
      for (let opt = 0; opt < optionCount; opt += 1) {
        const value = await options.nth(opt).getAttribute("value");
        if (value && value.trim()) {
          await select.selectOption(value, { timeout: 800 });
          filled += 1;
          break;
        }
      }
    } catch {
      // ignore
    }
  }

  return filled;
}

export async function clickOperationalButtons(
  page: Page,
  options?: { allowDestructive?: boolean }
): Promise<number> {
  let clicked = 0;
  page.on("dialog", (dialog) => {
    void dialog.dismiss().catch(() => undefined);
  });

  const buttons = page.locator("button:visible");
  const count = await buttons.count();

  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    const label = ((await button.innerText().catch(() => "")) || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!label || label.length > 48) continue;

    const firstWord = label.split(/\s+/)[0] ?? label;
    if (!OPERATIONAL_BUTTON.test(firstWord) && !OPERATIONAL_BUTTON.test(label)) continue;
    if (!options?.allowDestructive && DESTRUCTIVE_BUTTON.test(label)) continue;

    try {
      await button.click({ timeout: 1200 });
      clicked += 1;
      await page.waitForTimeout(300);

      const close = page
        .getByRole("button", { name: /^(close|cancel|done|x)$/i })
        .first();
      if (await close.isVisible().catch(() => false)) {
        await close.click({ timeout: 800 }).catch(() => undefined);
      }
    } catch {
      // Button may be disabled or covered.
    }
  }

  return clicked;
}

export async function attemptFormSubmits(page: Page): Promise<number> {
  let attempts = 0;
  const submitButtons = page.getByRole("button", {
    name: /^(submit|save|send request|raise rfi|complete|sign off|save draft)$/i,
  });
  const count = await submitButtons.count();

  for (let index = 0; index < count; index += 1) {
    const button = submitButtons.nth(index);
    if (!(await button.isVisible().catch(() => false))) continue;
    if (!(await button.isEnabled().catch(() => false))) continue;

    try {
      await button.click({ timeout: 1500 });
      attempts += 1;
      await page.waitForTimeout(500);
    } catch {
      // ignore
    }
  }

  return attempts;
}

export async function openFormModals(page: Page): Promise<number> {
  let opened = 0;
  const triggers = page.getByRole("button", {
    name: /new|add|create|submit|request|raise|pre-start|toolbox|safety walk|rfi|leave|prestart/i,
  });
  const count = await triggers.count();

  for (let index = 0; index < Math.min(count, 8); index += 1) {
    const trigger = triggers.nth(index);
    if (!(await trigger.isVisible().catch(() => false))) continue;

    try {
      await trigger.click({ timeout: 1500 });
      opened += 1;
      await page.waitForTimeout(400);
      await fillAllVisibleFields(page);
      await attemptFormSubmits(page);

      const close = page
        .getByRole("button", { name: /^(close|cancel|x)$/i })
        .first();
      if (await close.isVisible().catch(() => false)) {
        await close.click({ timeout: 800 }).catch(() => undefined);
      }
    } catch {
      // ignore
    }
  }

  return opened;
}
