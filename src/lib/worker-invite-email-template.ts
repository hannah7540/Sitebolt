/** Worker invite / password-setup email. Always send as a full `html` document. */

export const WORKER_INVITE_EMAIL_SUBJECT =
  "Welcome to SiteBolt - Set Your Password";

export function assertActionUrl(value: string | null | undefined): string {
  const actionUrl = value?.trim() ?? "";
  if (!actionUrl) {
    throw new Error(
      "Invite actionUrl is empty or undefined; refusing to send a text-only email."
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(actionUrl);
  } catch {
    throw new Error(`Invite actionUrl is invalid: ${actionUrl}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `Invite actionUrl must be an absolute http(s) URL: ${actionUrl}`
    );
  }

  return actionUrl;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildWorkerInviteEmailContent(actionUrl: string): {
  subject: string;
  html: string;
  text: string;
} {
  const safeUrl = assertActionUrl(actionUrl);
  const href = escapeHtml(safeUrl);

  return {
    subject: WORKER_INVITE_EMAIL_SUBJECT,
    html: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="x-ua-compatible" content="ie=edge">
    <title>Welcome to SiteBolt</title>
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
          <h2 style="margin:0 0 16px 0;color:#0f172a;font-size:20px;">Welcome to SiteBolt</h2>
          <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#475569;">
            You have been added to SiteBolt. Tap the button below to set your account password and access your profile:
          </p>
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="13%" strokecolor="#f97316" fillcolor="#f97316">
            <w:anchorlock/>
            <center style="color:#ffffff;font-family:sans-serif;font-size:16px;font-weight:bold;">Set Your Password</center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-->
          <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin: 28px auto;">
            <tr>
              <td align="center" style="border-radius: 6px; background-color: #f97316;">
                <a href="${href}" target="_blank" rel="noopener noreferrer" style="background-color: #f97316; color: #ffffff !important; display: inline-block; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: bold; line-height: 48px; text-align: center; text-decoration: none; width: 220px; -webkit-text-size-adjust: none; mso-hide: all; border-radius: 6px;">
                  Set Your Password
                </a>
              </td>
            </tr>
          </table>
          <!--<![endif]-->
          <p style="margin: 24px 0 8px 0; font-size: 13px; color: #64748b; text-align: center;">
            Or copy and paste this link into your browser:
          </p>
          <p style="margin: 0; font-size: 12px; text-align: center; word-break: break-all;">
            <a href="${href}" target="_blank" rel="noopener noreferrer" style="color: #f97316; text-decoration: underline;">
              ${href}
            </a>
          </p>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding:16px;background-color:#f8fafc;border-top:1px solid #f1f5f9;font-size:12px;color:#94a3b8;">
          &copy; 2026 SiteBolt Management Software. All rights reserved.
        </td>
      </tr>
    </table>
  </body>
</html>`,
    text: `Welcome to SiteBolt.\n\nPlease click the link below to set your password and access your account:\n${safeUrl}`,
  };
}
