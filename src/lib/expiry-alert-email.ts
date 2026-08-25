import type { ComplianceAlertItem } from "./compliance-alerts-hub";
import type {
  UpcomingInsuranceExpiry,
  UpcomingWorkerQualificationExpiry,
} from "./expiry-alerts";
import { getSiteUrl } from "./supabase/env";

function formatDisplayDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "2-digit",
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

function organisationAlertsUrl(): string {
  return `${getSiteUrl()}/organisation/alerts`;
}

function ctaButtonHtml(href: string, label = "Open Organisation Alerts"): string {
  return `
    <p style="margin:24px 0 8px;">
      <a href="${escapeHtml(href)}"
         style="display:inline-block;background:#ea580c;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700;font-size:14px;">
        ${escapeHtml(label)}
      </a>
    </p>
    <p style="color:#64748b;font-size:12px;">Or open: ${escapeHtml(href)}</p>`;
}

function buildHtmlTable(headers: string[], rows: string[][]): string {
  const head = headers
    .map(
      (cell) =>
        `<th style="padding:8px;border:1px solid #e2e8f0;text-align:left;background:#fff7ed;">${escapeHtml(cell)}</th>`
    )
    .join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${row
          .map(
            (cell) =>
              `<td style="padding:8px;border:1px solid #e2e8f0;">${escapeHtml(cell)}</td>`
          )
          .join("")}</tr>`
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

function categoryTitle(category: ComplianceAlertItem["category"]): string {
  switch (category) {
    case "heavy_vehicle_check":
      return "Heavy Vehicle Check";
    case "fleet_registration":
      return "Fleet Registration";
    case "plant_registration":
      return "Plant Registration";
    case "worker_ticket":
      return "Worker Ticket / License";
    case "company_insurance":
      return "Company Insurance";
    default:
      return "Compliance Item";
  }
}

function daysRemainingLabel(days: number): string {
  if (days < 0) return `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;
  if (days === 0) return "Expires today";
  return `${days} day${days === 1 ? "" : "s"} remaining`;
}

/** Single-item Action Required email for Organisation Alerts. */
export function buildComplianceAlertItemEmail(
  alert: ComplianceAlertItem
): { subject: string; html: string; text: string } {
  const itemName = alert.title?.trim() || alert.documentLabel || "Compliance item";
  const dueLabel = formatDisplayDate(alert.expiryDate);
  const subject = `[Action Required] SiteBolt Alert: ${itemName} Expiring Soon`;
  const alertsUrl = organisationAlertsUrl();
  const category = categoryTitle(alert.category);

  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;max-width:720px;">
      <h2 style="color:#ea580c;margin-bottom:8px;">Action Required — SiteBolt Alert</h2>
      <p style="color:#475569;margin:0 0 12px;">
        <strong>${escapeHtml(itemName)}</strong>
        (${escapeHtml(category)}) is set to expire on <strong>${escapeHtml(dueLabel)}</strong>.
      </p>
      <ul style="color:#334155;line-height:1.6;">
        <li><strong>Item:</strong> ${escapeHtml(itemName)}</li>
        <li><strong>Details:</strong> ${escapeHtml(alert.subtitle || "—")}</li>
        <li><strong>Document:</strong> ${escapeHtml(alert.documentLabel || "—")}</li>
        <li><strong>Expiry / due date:</strong> ${escapeHtml(dueLabel)}</li>
        <li><strong>Status:</strong> ${escapeHtml(daysRemainingLabel(alert.daysRemaining))}</li>
      </ul>
      ${ctaButtonHtml(alertsUrl)}
      <p style="color:#64748b;font-size:12px;margin-top:16px;">Automated compliance notification from SiteBolt.</p>
    </div>`;

  const text = [
    `Action Required — SiteBolt Alert`,
    ``,
    `${itemName} (${category}) is set to expire on ${dueLabel}.`,
    `Details: ${alert.subtitle || "—"}`,
    `Document: ${alert.documentLabel || "—"}`,
    `Status: ${daysRemainingLabel(alert.daysRemaining)}`,
    ``,
    `Open Organisation Alerts: ${alertsUrl}`,
  ].join("\n");

  return { subject, html, text };
}

/** Category digest when multiple items share a filter group. */
export function buildComplianceAlertDigestEmail(
  categoryLabel: string,
  alerts: ComplianceAlertItem[]
): { subject: string; html: string; text: string } {
  const first = alerts[0];
  const itemHint =
    alerts.length === 1 && first
      ? first.title || first.documentLabel || categoryLabel
      : `${categoryLabel} (${alerts.length} items)`;

  const subject = `[Action Required] SiteBolt Alert: ${itemHint} Expiring Soon`;
  const alertsUrl = organisationAlertsUrl();

  const rows = alerts.map((alert) => [
    alert.title || "—",
    alert.documentLabel || "—",
    formatDisplayDate(alert.expiryDate),
    daysRemainingLabel(alert.daysRemaining),
  ]);

  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;max-width:720px;">
      <h2 style="color:#ea580c;margin-bottom:8px;">Action Required — ${escapeHtml(categoryLabel)}</h2>
      <p style="color:#475569;">
        The following items are inside their configured alert window and require review.
      </p>
      ${buildHtmlTable(["Asset / Worker", "Document", "Expiry / Due", "Days Remaining"], rows)}
      ${ctaButtonHtml(alertsUrl)}
      <p style="color:#64748b;font-size:12px;margin-top:16px;">Automated compliance notification from SiteBolt.</p>
    </div>`;

  const text = [
    `Action Required — ${categoryLabel}`,
    ``,
    buildTextTable(["Asset / Worker", "Document", "Expiry / Due", "Days Remaining"], rows),
    ``,
    `Open Organisation Alerts: ${alertsUrl}`,
  ].join("\n");

  return { subject, html, text };
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

  const subject =
    items.length === 1
      ? `[Action Required] SiteBolt Alert: ${items[0]!.documentType} Expiring Soon`
      : `[Action Required] SiteBolt Alert: Worker qualifications Expiring Soon (${items.length} items)`;

  const alertsUrl = organisationAlertsUrl();

  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;max-width:720px;">
      <h2 style="color:#ea580c;margin-bottom:8px;">Worker Qualifications — Expiry Alert</h2>
      <p style="color:#475569;">The following worker licences, VOCs, or tickets expire soon.</p>
      ${buildHtmlTable(["Worker", "Document / Licence", "Expiry Date", "Days Remaining"], rows)}
      ${ctaButtonHtml(alertsUrl)}
      <p style="color:#64748b;font-size:12px;margin-top:16px;">Automated compliance notification from SiteBolt.</p>
    </div>`;

  const text = `Worker Qualifications — Expiry Alert\n\n${buildTextTable(
    ["Worker", "Document / Licence", "Expiry Date", "Days Remaining"],
    rows
  )}\n\nOpen Organisation Alerts: ${alertsUrl}`;

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

  const subject =
    items.length === 1
      ? `[Action Required] SiteBolt Alert: ${items[0]!.policyName} Expiring Soon`
      : `[Action Required] SiteBolt Alert: Company insurance Expiring Soon (${items.length} policies)`;

  const alertsUrl = organisationAlertsUrl();

  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;max-width:720px;">
      <h2 style="color:#ea580c;margin-bottom:8px;">Company Insurance — Expiry Alert</h2>
      <p style="color:#475569;">The following company insurance policies expire soon.</p>
      ${buildHtmlTable(["Policy", "Policy Number", "Insurer", "Expiry Date", "Days Remaining"], rows)}
      ${ctaButtonHtml(alertsUrl)}
      <p style="color:#64748b;font-size:12px;margin-top:16px;">Automated compliance notification from SiteBolt.</p>
    </div>`;

  const text = `Company Insurance — Expiry Alert\n\n${buildTextTable(
    ["Policy", "Policy Number", "Insurer", "Expiry Date", "Days Remaining"],
    rows
  )}\n\nOpen Organisation Alerts: ${alertsUrl}`;

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

  const subject = `[Action Required] SiteBolt Alert: Qualification expiry reminder`;
  const alertsUrl = organisationAlertsUrl();

  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;max-width:720px;">
      <h2 style="color:#ea580c;margin-bottom:8px;">Qualification Expiry Reminder</h2>
      <p style="color:#475569;">Hi ${escapeHtml(workerName)},</p>
      <p style="color:#475569;">The following qualification(s) on your profile expire soon. Please arrange renewal and upload updated documents.</p>
      ${buildHtmlTable(["Document / Licence", "Expiry Date", "Days Remaining"], rows)}
      ${ctaButtonHtml(alertsUrl)}
      <p style="color:#64748b;font-size:12px;margin-top:16px;">SiteBolt compliance notification.</p>
    </div>`;

  const text = `Hi ${workerName},\n\nQualification Expiry Reminder\n\n${buildTextTable(
    ["Document / Licence", "Expiry Date", "Days Remaining"],
    rows
  )}\n\nOpen Organisation Alerts: ${alertsUrl}`;

  return { subject, html, text };
}
