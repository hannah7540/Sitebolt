import type {
  UpcomingInsuranceExpiry,
  UpcomingWorkerQualificationExpiry,
} from "./expiry-alerts";

function formatDisplayDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtmlTable(headers: string[], rows: string[][]): string {
  const head = headers.map((cell) => `<th style="padding:8px;border:1px solid #e2e8f0;text-align:left;background:#fff7ed;">${escapeHtml(cell)}</th>`).join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td style="padding:8px;border:1px solid #e2e8f0;">${escapeHtml(cell)}</td>`).join("")}</tr>`
    )
    .join("");

  return `<table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:14px;color:#0f172a;"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function buildTextTable(headers: string[], rows: string[][]): string {
  const lines = [headers.join(" | "), headers.map(() => "---").join(" | ")];
  for (const row of rows) {
    lines.push(row.join(" | "));
  }
  return lines.join("\n");
}

export function buildWorkerExpiryDigestEmail(
  items: UpcomingWorkerQualificationExpiry[]
): { subject: string; html: string; text: string } {
  const rows = items.map((item) => [
    item.workerName,
    item.documentType,
    formatDisplayDate(item.expiryDate),
    `${item.daysRemaining} day${item.daysRemaining === 1 ? "" : "s"}`,
  ]);

  const subject = `[SiteBolt] Worker qualification expiry alert (${items.length} item${items.length === 1 ? "" : "s"})`;

  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;max-width:720px;">
      <h2 style="color:#ea580c;margin-bottom:8px;">Worker Qualifications — 30-Day Expiry Alert</h2>
      <p style="color:#475569;">The following worker licences, VOCs, or tickets expire within the next 30 days.</p>
      ${buildHtmlTable(["Worker", "Document / Licence", "Expiry Date", "Days Remaining"], rows)}
      <p style="color:#64748b;font-size:12px;margin-top:16px;">Automated compliance notification from SiteBolt.</p>
    </div>`;

  const text = `Worker Qualifications — 30-Day Expiry Alert\n\n${buildTextTable(
    ["Worker", "Document / Licence", "Expiry Date", "Days Remaining"],
    rows
  )}`;

  return { subject, html, text };
}

export function buildInsuranceExpiryDigestEmail(
  items: UpcomingInsuranceExpiry[]
): { subject: string; html: string; text: string } {
  const rows = items.map((item) => [
    item.policyName,
    item.policyNumber ?? "—",
    item.insurer ?? "—",
    formatDisplayDate(item.expiryDate),
    `${item.daysRemaining} day${item.daysRemaining === 1 ? "" : "s"}`,
  ]);

  const subject = `[SiteBolt] Company insurance expiry alert (${items.length} polic${items.length === 1 ? "y" : "ies"})`;

  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;max-width:720px;">
      <h2 style="color:#ea580c;margin-bottom:8px;">Company Insurance — 30-Day Expiry Alert</h2>
      <p style="color:#475569;">The following company insurance policies expire within the next 30 days.</p>
      ${buildHtmlTable(["Policy", "Policy Number", "Insurer", "Expiry Date", "Days Remaining"], rows)}
      <p style="color:#64748b;font-size:12px;margin-top:16px;">Automated compliance notification from SiteBolt.</p>
    </div>`;

  const text = `Company Insurance — 30-Day Expiry Alert\n\n${buildTextTable(
    ["Policy", "Policy Number", "Insurer", "Expiry Date", "Days Remaining"],
    rows
  )}`;

  return { subject, html, text };
}

export function buildWorkerDirectNotifyEmail(
  items: UpcomingWorkerQualificationExpiry[]
): { subject: string; html: string; text: string } {
  const workerName = items[0]?.workerName ?? "Team member";
  const rows = items.map((item) => [
    item.documentType,
    formatDisplayDate(item.expiryDate),
    `${item.daysRemaining} day${item.daysRemaining === 1 ? "" : "s"}`,
  ]);

  const subject = `[SiteBolt] Action required: qualification expiry reminder`;

  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;max-width:720px;">
      <h2 style="color:#ea580c;margin-bottom:8px;">Qualification Expiry Reminder</h2>
      <p style="color:#475569;">Hi ${escapeHtml(workerName)},</p>
      <p style="color:#475569;">The following qualification(s) on your profile expire within the next 30 days. Please arrange renewal and upload updated documents to your site administrator.</p>
      ${buildHtmlTable(["Document / Licence", "Expiry Date", "Days Remaining"], rows)}
      <p style="color:#64748b;font-size:12px;margin-top:16px;">SiteBolt compliance notification.</p>
    </div>`;

  const text = `Hi ${workerName},\n\nQualification Expiry Reminder\n\n${buildTextTable(
    ["Document / Licence", "Expiry Date", "Days Remaining"],
    rows
  )}`;

  return { subject, html, text };
}
