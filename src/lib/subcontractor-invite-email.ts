import { Resend } from "resend";
import { DEFAULT_SYSTEM_FROM_EMAIL } from "@/lib/email-config";

export const SUBCONTRACTOR_ONBOARDING_PATH = "/onboarding/subcontractor";

function getResendClient(): Resend | null {
  const apiKey =
    process.env.RESEND_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  return new Resend(apiKey);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function resolveInviteOrigin(): string {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return "https://www.site-bolt.com.au";
}

export function buildSubcontractorOnboardingUrl(email: string): string {
  const origin = resolveInviteOrigin();
  const url = new URL(`${origin}${SUBCONTRACTOR_ONBOARDING_PATH}`);
  url.searchParams.set("email", email.trim());
  return url.toString();
}

export function buildSubcontractorInviteEmailContent(input: {
  actionUrl: string;
  companyName: string;
  contactName: string;
}): { subject: string; html: string; text: string } {
  const href = escapeHtml(input.actionUrl);
  const company = escapeHtml(input.companyName.trim() || "your company");
  const contact = escapeHtml(input.contactName.trim() || "there");

  return {
    subject: "You're invited to SiteBolt — complete subcontractor onboarding",
    html: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SiteBolt Subcontractor Invite</title>
  </head>
  <body style="margin:0;padding:24px;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:8px;">
      <tr>
        <td align="center" style="background-color:#1e242b;padding:24px;">
          <span style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:1.5px;">SITEBOLT</span>
        </td>
      </tr>
      <tr>
        <td style="padding:32px 28px;color:#334155;">
          <h2 style="margin:0 0 16px 0;color:#0f172a;font-size:20px;">Welcome, ${contact}</h2>
          <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#475569;">
            ${company} has been invited to the SiteBolt subcontractor portal. Tap the button below to start onboarding:
          </p>
          <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin: 28px auto;">
            <tr>
              <td align="center" style="border-radius: 6px; background-color: #f97316;">
                <a href="${href}" target="_blank" rel="noopener noreferrer" style="background-color: #f97316; color: #ffffff !important; display: inline-block; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: bold; line-height: 48px; text-align: center; text-decoration: none; width: 220px; border-radius: 6px;">
                  Start Onboarding
                </a>
              </td>
            </tr>
          </table>
          <p style="text-align: center; font-size: 12px; margin-top: 16px;">
            <a href="${href}" style="color: #f97316; text-decoration: underline;">${href}</a>
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`,
    text: `Welcome to SiteBolt, ${input.contactName.trim() || "there"}.\n\n${input.companyName.trim() || "Your company"} has been invited to the subcontractor portal. Open this link to start onboarding:\n${input.actionUrl}`,
  };
}

export async function sendSubcontractorInviteEmail(input: {
  email: string;
  companyName: string;
  contactName: string;
}): Promise<{ success: boolean; error: string | null }> {
  const email = input.email.trim();
  if (!email) return { success: false, error: "Email is required." };

  const resend = getResendClient();
  if (!resend) {
    return { success: false, error: "Resend API key is not configured." };
  }

  const actionUrl = buildSubcontractorOnboardingUrl(email);
  const content = buildSubcontractorInviteEmailContent({
    actionUrl,
    companyName: input.companyName,
    contactName: input.contactName,
  });

  const result = await resend.emails.send({
    from: DEFAULT_SYSTEM_FROM_EMAIL,
    to: email,
    subject: content.subject,
    html: content.html,
    text: content.text,
  });

  if (result.error) {
    return { success: false, error: result.error.message };
  }
  return { success: true, error: null };
}
