import twilio from "twilio";
import { SMS_OUTBOUND_PREFIX } from "@/lib/sms-types";
import { formatOutboundPhoneE164, withOutboundPrefix } from "@/lib/sms-phone";

export const TWILIO_MISSING_CREDS_ERROR =
  "Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN in environment variables";

export function getTwilioCredentials(): {
  accountSid: string;
  authToken: string;
  fromNumber: string;
} {
  return {
    accountSid: (process.env.TWILIO_ACCOUNT_SID || "").trim(),
    authToken: (process.env.TWILIO_AUTH_TOKEN || "").trim(),
    fromNumber: (process.env.TWILIO_PHONE_NUMBER || "").trim(),
  };
}

export function validateTwilioCredentials():
  | { ok: true; accountSid: string; authToken: string; fromNumber: string }
  | { ok: false; error: string } {
  const { accountSid, authToken, fromNumber } = getTwilioCredentials();
  if (!accountSid || !authToken) {
    return { ok: false, error: TWILIO_MISSING_CREDS_ERROR };
  }
  return { ok: true, accountSid, authToken, fromNumber };
}

export function logTwilioAuthCheck(accountSid: string, authToken: string): void {
  console.log(
    "Twilio Auth Check - SID:",
    accountSid ? `${accountSid.substring(0, 6)}...` : "MISSING",
    "Token length:",
    authToken.length
  );
}

export function isTwilioConfigured(): boolean {
  const creds = validateTwilioCredentials();
  return creds.ok && Boolean(creds.fromNumber);
}

export function getTwilioFromNumber(): string | null {
  const { fromNumber } = getTwilioCredentials();
  return fromNumber || null;
}

function createTwilioClient(accountSid: string, authToken: string) {
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
  const creds = validateTwilioCredentials();
  if (!creds.ok) {
    return {
      sid: null,
      body: input.body,
      error: creds.error,
      twilioCode: null,
    };
  }

  if (!creds.fromNumber) {
    return {
      sid: null,
      body: input.body,
      error: "TWILIO_PHONE_NUMBER is missing or invalid.",
      twilioCode: null,
    };
  }

  const from =
    formatOutboundPhoneE164(creds.fromNumber) ?? creds.fromNumber;
  const to = formatOutboundPhoneE164(input.to);
  if (!to) {
    return {
      sid: null,
      body: input.body,
      error: `Invalid recipient phone: ${input.to} (expected AU mobile E.164, e.g. +61412345678).`,
      twilioCode: null,
    };
  }

  const body =
    input.prependPrefix === false
      ? input.body.trim()
      : withOutboundPrefix(input.body, SMS_OUTBOUND_PREFIX);

  logTwilioAuthCheck(creds.accountSid, creds.authToken);
  console.log("Final formatted E.164 number:", to, "From:", from);

  try {
    const client = createTwilioClient(creds.accountSid, creds.authToken);
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
