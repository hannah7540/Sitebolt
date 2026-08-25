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

function readTwilioError(error: unknown): {
  message: string;
  twilioCode: string | number | null;
} {
  if (error && typeof error === "object") {
    const record = error as { message?: string; code?: string | number };
    const message =
      typeof record.message === "string" && record.message.trim()
        ? record.message.trim()
        : error instanceof Error
          ? error.message
          : "Twilio send failed.";
    const twilioCode =
      record.code !== undefined && record.code !== null ? record.code : null;
    return { message, twilioCode };
  }
  return {
    message: error instanceof Error ? error.message : "Twilio send failed.",
    twilioCode: null,
  };
}

export async function sendTwilioSms(input: {
  to: string;
  body: string;
  prependPrefix?: boolean;
}): Promise<{
  sid: string | null;
  body: string;
  error: string | null;
  twilioCode: string | number | null;
}> {
  if (!isTwilioConfigured()) {
    return {
      sid: null,
      body: input.body,
      error: "Twilio is not configured (TWILIO_ACCOUNT_SID / AUTH_TOKEN / PHONE_NUMBER).",
      twilioCode: null,
    };
  }

  const from = getTwilioFromNumber();
  const to = toE164Phone(input.to);
  if (!from || !to) {
    return {
      sid: null,
      body: input.body,
      error: !to
        ? `Invalid recipient phone: ${input.to} (expected AU mobile E.164, e.g. +61412345678).`
        : "TWILIO_PHONE_NUMBER is missing.",
      twilioCode: null,
    };
  }

  const body =
    input.prependPrefix === false
      ? input.body.trim()
      : withOutboundPrefix(input.body, SMS_OUTBOUND_PREFIX);

  console.log("Dispatching Twilio SMS to:", to, "From:", from);

  try {
    const client = createTwilioClient();
    const message = await client.messages.create({
      from,
      to,
      body,
    });

    console.log("[Twilio SMS] dispatched:", {
      sid: message.sid,
      to,
      status: message.status,
    });

    return {
      sid: message.sid ?? null,
      body,
      error: null,
      twilioCode: null,
    };
  } catch (error) {
    const { message, twilioCode } = readTwilioError(error);
    console.error("[Twilio SMS] dispatch failed:", {
      to,
      from,
      twilioCode,
      message,
    });
    return {
      sid: null,
      body,
      error: message,
      twilioCode,
    };
  }
}

export function emptyTwimlResponse(): string {
  return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
}
