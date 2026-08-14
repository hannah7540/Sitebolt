function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatEffectiveDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function buildWorkerReallocationEmail(input: {
  firstName: string;
  projectName: string;
  effectiveDate: string;
  dashboardUrl: string;
  companyName: string;
  inductionAssigned: boolean;
}): { subject: string; html: string; text: string } {
  const firstName = input.firstName.trim() || "there";
  const projectName = input.projectName.trim() || "your new project";
  const effectiveLabel = formatEffectiveDate(input.effectiveDate);
  const companyName = input.companyName.trim() || "Site Management Team";

  const subject = `Project Reallocation: You have been assigned to ${projectName}`;

  const inductionParagraph = input.inductionAssigned
    ? `<p style="color:#475569;line-height:1.6;">If this is your first time working on this site, please log in to your Worker Dashboard and complete the site-specific induction that has been assigned to your profile before arriving on site.</p>`
    : `<p style="color:#475569;line-height:1.6;">Please log in to your Worker Dashboard to review your assignment details before arriving on site.</p>`;

  const inductionText = input.inductionAssigned
    ? "If this is your first time working on this site, please log in to your Worker Dashboard and complete the site-specific induction that has been assigned to your profile before arriving on site."
    : "Please log in to your Worker Dashboard to review your assignment details before arriving on site.";

  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;max-width:640px;">
      <p style="color:#475569;line-height:1.6;">Hi ${escapeHtml(firstName)},</p>
      <p style="color:#475569;line-height:1.6;">You have been moved to <strong>${escapeHtml(projectName)}</strong> starting from <strong>${escapeHtml(effectiveLabel)}</strong>.</p>
      ${inductionParagraph}
      <p style="margin:24px 0;">
        <a href="${escapeHtml(input.dashboardUrl)}" style="display:inline-block;background-color:#ea580c;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;padding:12px 24px;border-radius:8px;">
          Go to Worker Dashboard
        </a>
      </p>
      <p style="color:#475569;line-height:1.6;">Regards,<br />${escapeHtml(companyName)}</p>
    </div>`;

  const text = `Hi ${firstName},

You have been moved to ${projectName} starting from ${effectiveLabel}.

${inductionText}

Go to Worker Dashboard: ${input.dashboardUrl}

Regards,
${companyName}`;

  return { subject, html, text };
}
