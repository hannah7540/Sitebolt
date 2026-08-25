/** Strip spaces, brackets, dashes, periods, and other non-phone characters. */
export function stripPhoneFormatting(phone: string | null | undefined): string {
  return String(phone ?? "")
    .trim()
    .replace(/[^0-9+]/g, "");
}

/** Digits-only phone string for comparisons. */
export function normalizePhoneDigits(phone: string | null | undefined): string {
  return String(phone ?? "").replace(/\D/g, "");
}

/**
 * Normalize phone numbers to a consistent AU E.164 form (+614XXXXXXXX).
 * Strips spaces, brackets, hyphens, periods, and other formatting first.
 */
export function normalizePhoneNumber(phone: string | null | undefined): string {
  const raw = String(phone ?? "").trim();
  if (!raw) return "";

  const cleaned = raw.replace(/[^0-9+]/g, "").trim();
  if (!cleaned) return "";

  if (cleaned.startsWith("+614")) {
    return cleaned;
  }

  if (cleaned.startsWith("+61")) {
    return cleaned;
  }

  const digitsOnly = cleaned.replace(/\D/g, "");
  if (!digitsOnly) return "";

  if (digitsOnly.startsWith("04")) {
    return `+614${digitsOnly.slice(2)}`;
  }

  if (digitsOnly.startsWith("614")) {
    return `+${digitsOnly}`;
  }

  if (digitsOnly.startsWith("4") && digitsOnly.length === 9) {
    return `+61${digitsOnly}`;
  }

  if (cleaned.startsWith("+")) {
    return cleaned;
  }

  return "";
}

/** Normalize worker/contact phone for storage; returns null when blank. */
export function sanitizeStoredPhoneNumber(
  phone: string | null | undefined
): string | null {
  const raw = String(phone ?? "").trim();
  if (!raw) return null;
  const normalized = normalizePhoneNumber(raw);
  if (normalized) return normalized;
  const cleaned = raw.replace(/[^0-9+]/g, "").trim();
  return cleaned || null;
}

/** Match two phone numbers after E.164 normalization. */
export function phonesMatch(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  const a = normalizePhoneNumber(left);
  const b = normalizePhoneNumber(right);
  return Boolean(a && b && a === b);
}

/** External participant phone for an SMS row (inbound sender or outbound recipient). */
export function getSmsContactPhone(message: {
  direction: string;
  from_number: string;
  to_number: string;
}): string {
  const raw =
    message.direction === "inbound" ? message.from_number : message.to_number;
  return normalizePhoneNumber(raw);
}

/**
 * Format outbound AU numbers to E.164 for Twilio dispatch.
 */
export function formatOutboundPhoneE164(
  phone: string | null | undefined
): string | null {
  const normalized = normalizePhoneNumber(phone);
  return normalized || null;
}

/** Best-effort E.164 for AU mobiles (used for matching and outbound dispatch). */
export function toE164Phone(phone: string | null | undefined): string | null {
  return formatOutboundPhoneE164(phone);
}

export function conversationPhoneKey(phone: string | null | undefined): string {
  return normalizePhoneNumber(phone);
}

export function withOutboundPrefix(body: string, prefix: string): string {
  const trimmed = body.trim();
  if (!trimmed) return prefix.trim();
  if (trimmed.toUpperCase().startsWith(prefix.trim().toUpperCase())) {
    return trimmed;
  }
  return `${prefix}${trimmed}`;
}

export function smsSegmentCount(body: string, segmentLength = 160): number {
  const length = body.length;
  if (length <= 0) return 0;
  return Math.ceil(length / segmentLength);
}
