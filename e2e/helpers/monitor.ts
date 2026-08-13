import type { Page, Response } from "@playwright/test";

const IGNORED_CONSOLE_PATTERNS = [
  /Download the React DevTools/i,
  /Third-party cookie/i,
  /favicon\.ico/i,
  /Failed to load resource: the server responded with a status of/i,
  /\[AssignPayRuleSelect\]/i,
];

const IGNORED_API_PATHS = [
  /\/favicon\.ico$/,
  /\/_next\/static\//,
  /\/_next\/image/,
  /\/__nextjs_original-stack-frames/,
];

export interface PageMonitor {
  consoleErrors: string[];
  pageErrors: string[];
  badResponses: string[];
  attach: () => void;
  assertClean: (label: string) => void;
}

export function createPageMonitor(page: Page): PageMonitor {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const badResponses: string[] = [];

  const attach = () => {
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (IGNORED_CONSOLE_PATTERNS.some((pattern) => pattern.test(text))) return;
      consoleErrors.push(text);
    });

    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });

    page.on("response", (response: Response) => {
      const url = response.url();
      if (IGNORED_API_PATHS.some((pattern) => pattern.test(url))) return;
      const status = response.status();
      if (status === 404 || status >= 500) {
        badResponses.push(`${status} ${url}`);
      }
    });
  };

  const assertClean = (label: string) => {
    const issues = [
      ...pageErrors.map((message) => `React runtime: ${message}`),
      ...consoleErrors.map((message) => `Console: ${message}`),
      ...badResponses.map((message) => `HTTP: ${message}`),
    ];
    if (issues.length > 0) {
      throw new Error(`${label} encountered diagnostics:\n- ${issues.join("\n- ")}`);
    }
  };

  return { consoleErrors, pageErrors, badResponses, attach, assertClean };
}
