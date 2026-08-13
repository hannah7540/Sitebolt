import type { Page } from "@playwright/test";

const SAFE_BUTTON =
  /^(export csv|export|filter|clear search|close|cancel|back|refresh|run all tests|copy sql fix|assigned workers|reporting|workers|financial information|basic information)$/i;

const SKIP_BUTTON =
  /^(revoke|reactivate|delete|remove|sign out|log out|submit|save changes|save|approve selected|reject)$/i;

export async function clickSafeOperationalButtons(page: Page): Promise<number> {
  let clicked = 0;
  const buttons = page.locator("button:visible");
  const count = await buttons.count();

  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    const label = ((await button.innerText().catch(() => "")) || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!label || label.length > 40) continue;
    if (SKIP_BUTTON.test(label)) continue;
    if (!SAFE_BUTTON.test(label) && !/^(edit|assign|sort|view)$/i.test(label)) {
      continue;
    }

    try {
      await button.click({ timeout: 1500 });
      clicked += 1;
      await page.waitForTimeout(250);

      const close = page.getByRole("button", { name: /^(close|cancel|x)$/i }).first();
      if (await close.isVisible().catch(() => false)) {
        await close.click({ timeout: 1000 }).catch(() => undefined);
      }
    } catch {
      // Ignore buttons that disappear or are disabled mid-crawl.
    }
  }

  return clicked;
}

export async function dismissVisibleModals(page: Page): Promise<void> {
  for (const name of [/close/i, /cancel/i]) {
    const button = page.getByRole("button", { name }).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click({ timeout: 1000 }).catch(() => undefined);
    }
  }
}
