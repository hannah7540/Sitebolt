/** Outlook/Gmail-safe high-contrast CTA used in invite and password-reset emails. */
export function buildEmailCtaButtonHtml(
  actionLink: string,
  label = "Set your password"
): string {
  const href = actionLink.trim();

  return `
<table border="0" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
  <tr>
    <td align="center" bgcolor="#0F172A" style="border-radius: 6px;">
      <a href="${href}"
         target="_blank"
         style="display: inline-block; padding: 14px 28px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 600; color: #FFFFFF !important; text-decoration: none; border-radius: 6px; background-color: #0F172A; mso-padding-alt: 0;">
        <!--[if mso]><i style="letter-spacing: 28px; mso-font-width: -100%; mso-text-raise: 20pt;">&nbsp;</i><![endif]-->
        <span style="color: #FFFFFF !important; text-decoration: none;">${label}</span>
        <!--[if mso]><i style="letter-spacing: 28px; mso-font-width: -100%;">&nbsp;</i><![endif]-->
      </a>
    </td>
  </tr>
</table>
<p style="font-size: 13px; color: #64748B; margin-top: 16px; word-break: break-all;">
  If the button above does not work, copy and paste this URL into your browser:<br />
  <a href="${href}" style="color: #2563EB;">${href}</a>
</p>`.trim();
}
