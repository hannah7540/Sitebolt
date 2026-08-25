import twilio from "twilio";
import { SMS_OUTBOUND_PREFIX } from "@/lib/sms-types";
import { toE164Phone, withOutboundPrefix } from "@/lib/sms-phone";

export function isTwilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_PHONE_NUMBER?.trim()
  );
}

export function getTwilioFromNumber(): string | null {
  return process.env.TWILIO_PHONE_NUMBER?.trim() || null;
}

function createTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials are not configured.");
  }
  return twilio(accountSid, authToken);
}

export async function sendTwilioSms(input: {
  to: string;
  body: string;
  prependPrefix?: boolean;
}): Promise<{ sid: string | null; body: string; error: string | null }> {
  if (!isTwilioConfigured()) {
    return {
      sid: null,
      body: input.body,
      error: "Twilio is not configured (TWILIO_ACCOUNT_SID / AUTH_TOKEN / PHONE_NUMBER).",
    };
  }

  const from = getTwilioFromNumber();
  const to = toE164Phone(input.to);
  if (!from || !to) {
    return {
      sid: null,
      body: input.body,
      error: !to ? `Invalid recipient phone: ${input.to}` : "TWILIO_PHONE_NUMBER is missing.",
    };
  }

  const body =
    input.prependPrefix === false
      ? input.body.trim()
      : withOutboundPrefix(input.body, SMS_OUTBOUND_PREFIX);

  try {
    const client = createTwilioClient();
    const message = await client.messages.create({
      from,
      to,
      body,
    });
    return { sid: message.sid ?? null, body, error: null };
  } catch (error) {
    return {
      sid: null,
      body,
      error: error instanceof Error ? error.message : "Twilio send failed.",
    };
  }
}

export function emptyTwimlResponse(): string {
  return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
}
