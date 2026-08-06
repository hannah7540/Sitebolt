export interface SendEmailInput {
  to: string[];
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  sent: boolean;
  provider: "resend" | "none";
  error?: string;
  messageId?: string;
  simulated?: boolean;
}

function resolveFromAddress(): string {
  return (
    process.env.EXPIRY_ALERT_FROM_EMAIL?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "SiteBolt Alerts <alerts@sitebolt.app>"
  );
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

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: resolveFromAddress(),
        to: recipients,
        subject: input.subject,
        html: input.html,
        text: input.text,
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
