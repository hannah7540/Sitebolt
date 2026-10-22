import { Resend } from "resend";
import { resolveSystemFromEmail } from "@/lib/email-config";
import { PRODUCTION_APP_ORIGIN } from "@/lib/site-domains";

export const SUBCONTRACTOR_ONBOARDING_PATH = "/subcontractor/onboard";
export const SUBCONTRACTOR_INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

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

export function resolveSubcontractorInviteOrigin(): string {
  const configured = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_APP_ORIGIN ||
    ""
  )
    .trim()
    .replace(/\/$/, "");

  if (
    /^https?:\/\//i.test(configured) &&
    !/localhost|127\.0\.0\.1/i.test(configured)
  ) {
    return configured;
  }

  return PRODUCTION_APP_ORIGIN;
}

export function buildSubcontractorOnboardingUrl(token: string): string {
  const origin = resolveSubcontractorInviteOrigin();
  const url = new URL(`${origin}${SUBCONTRACTOR_ONBOARDING_PATH}`);
  url.searchParams.set("token", token.trim());
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
    subject: "Action Required: Complete Subcontractor Onboarding for Site-Bolt",
    html: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Site-Bolt Subcontractor Onboarding</title>
  </head>
  <body style="margin:0;padding:24px;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:8px;">
      <tr>
        <td align="center" style="background-color:#1e242b;padding:24px;">
          <span style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:1.5px;">SITE-BOLT</span>
        </td>
      </tr>
      <tr>
        <td style="padding:32px 28px;color:#334155;">
          <h2 style="margin:0 0 16px 0;color:#0f172a;font-size:20px;">Hello ${contact},</h2>
          <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#475569;">
            ${company} has been added as a subcontractor company on Site-Bolt. To access the portal you need to complete self-onboarding: set up your account, company profile, ABN, and insurance documents.
          </p>
          <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#475569;">
            Use the button below to open your unique onboarding link and finish setup.
          </p>
          <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin: 28px auto;">
            <tr>
              <td align="center" style="border-radius: 6px; background-color: #f97316;">
                <a href="${href}" target="_blank" rel="noopener noreferrer" style="background-color: #f97316; color: #ffffff !important; display: inline-block; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: bold; line-height: 48px; text-align: center; text-decoration: none; width: 260px; border-radius: 6px;">
                  Complete Onboarding
                </a>
              </td>
            </tr>
          </table>
          <p style="text-align: center; font-size: 12px; margin-top: 16px; color:#64748b;">
            If the button does not work, copy this link:<br>
            <a href="${href}" style="color: #f97316; text-decoration: underline; word-break: break-all;">${href}</a>
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`,
    text: `Hello ${input.contactName.trim() || "there"},\n\n${input.companyName.trim() || "Your company"} has been added as a subcontractor company on Site-Bolt. Complete self-onboarding to set up your account, company profile, ABN, and insurances.\n\nOpen this link:\n${input.actionUrl}`,
  };
}

export async function sendSubcontractorInviteEmail(input: {
  email: string;
  companyName: string;
  contactName: string;
  token: string;
}): Promise<{ success: boolean; error: string | null; actionUrl: string | null }> {
  const email = input.email.trim();
  const token = input.token.trim();
  if (!email) return { success: false, error: "Email is required.", actionUrl: null };
  if (!token) return { success: false, error: "Onboarding token is required.", actionUrl: null };

  const resend = getResendClient();
  if (!resend) {
    console.error("[subcontractor-invite] Resend API key is not configured.");
    return { success: false, error: "Resend API key is not configured.", actionUrl: null };
  }

  const actionUrl = buildSubcontractorOnboardingUrl(token);
  const from = resolveSystemFromEmail();
  const content = buildSubcontractorInviteEmailContent({
    actionUrl,
    companyName: input.companyName,
    contactName: input.contactName,
  });

  console.log("[subcontractor-invite] Sending Resend invite", {
    to: email,
    from,
    actionUrl,
    companyName: input.companyName,
  });

  try {
    const result = await resend.emails.send({
      from,
      to: email,
      subject: content.subject,
      html: content.html,
      text: content.text,
    });

    if (result.error) {
      console.error("[subcontractor-invite] Resend API error", result.error);
      return { success: false, error: result.error.message, actionUrl };
    }

    console.log("[subcontractor-invite] Resend invite sent", {
      to: email,
      id: result.data?.id ?? null,
    });
    return { success: true, error: null, actionUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send invitation email.";
    console.error("[subcontractor-invite] Resend request failed", error);
    return { success: false, error: message, actionUrl };
  }
}
