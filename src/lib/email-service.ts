import { resolveSystemFromEmail } from "./email-config";
import {
  appendTeamEmailFooter,
  appendTeamEmailFooterText,
} from "./email-team-footer";

export interface SendEmailInput {
  to: string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  /** When true, skip appending the SiteBolt team banner footer. */
  skipTeamFooter?: boolean;
}

export interface SendEmailResult {
  sent: boolean;
  provider: "resend" | "none";
  error?: string;
  messageId?: string;
  simulated?: boolean;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const recipients = input.to.map((email) => email.trim()).filter(Boolean);
  if (recipients.length === 0) {
    return { sent: false, provider: "none", error: "No recipients." };
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[expiry-alerts] RESEND_API_KEY not set; email not sent.", {
      subject: input.subject,
      to: recipients,
    });
    return {
      sent: false,
      provider: "none",
      simulated: true,
      error: "RESEND_API_KEY is not configured.",
    };
  }

  const html = input.skipTeamFooter
    ? input.html
    : appendTeamEmailFooter(input.html);
  const text = input.skipTeamFooter
    ? input.text
    : input.text != null
      ? appendTeamEmailFooterText(input.text)
      : undefined;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: resolveSystemFromEmail(),
        to: recipients,
        subject: input.subject,
        html,
        text,
        reply_to: input.replyTo,
        headers: input.headers,
      }),
    });

    const payload = (await response.json()) as { id?: string; message?: string };

    if (!response.ok) {
      return {
        sent: false,
        provider: "resend",
        error: payload.message ?? `Resend API error (${response.status})`,
      };
    }

    return {
      sent: true,
      provider: "resend",
      messageId: payload.id,
    };
  } catch (error) {
    return {
      sent: false,
      provider: "resend",
      error: error instanceof Error ? error.message : "Failed to send email.",
    };
  }
}
