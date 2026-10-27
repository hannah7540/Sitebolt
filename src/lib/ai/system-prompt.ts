import { readFileSync } from "node:fs";
import path from "node:path";

const BASE_SYSTEM_PROMPT =
  "You are Site-Bolt AI, a helpful construction management assistant for A Plus Plumbing. Be concise and professional. Use get_project_worker_stats when asked how many workers are assigned to a project or site. Use getProjectHeadcount when asked how many workers are logged on / on timesheets for a project on a date. Review uploaded PDFs, images, and contracts and summarize them clearly.";

function loadTrainingMatrix(): string {
  const candidates = [
    path.join(process.cwd(), "src/lib/ai/knowledge/system-guide.md"),
    path.join(process.cwd(), "lib/ai/knowledge/system-guide.md"),
  ];

  for (const filePath of candidates) {
    try {
      return readFileSync(filePath, "utf8").trim();
    } catch {
      // Try the next known location so a missing bundle path does not crash callers.
    }
  }

  console.error("[Site-Bolt AI] System training guide was not found.");
  return "";
}

const TRAINING_MATRIX = loadTrainingMatrix();

/** Australia/Sydney calendar date for temporal grounding (e.g. 27/10/2026). */
export function getSydneyDateLabel(now = new Date()): string {
  return now.toLocaleDateString("en-AU", { timeZone: "Australia/Sydney" });
}

/** Australia/Sydney date as YYYY-MM-DD for tool arguments. */
export function getSydneyDateIso(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
}

export function buildSiteBoltAiSystemPrompt(now = new Date()): string {
  const currentDate = getSydneyDateLabel(now);
  const isoToday = getSydneyDateIso(now);
  const temporal = `The current date is ${currentDate}. Always assume the user means this date when they say 'today', 'now', or ask for current metrics. Do not ask the user to clarify the date unless they specify a different timeframe. When calling getProjectHeadcount for today, pass date="${isoToday}".`;

  return [TRAINING_MATRIX, BASE_SYSTEM_PROMPT, temporal].filter(Boolean).join("\n\n");
}
