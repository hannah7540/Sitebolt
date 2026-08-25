/** Strip spaces, brackets, and dashes from a phone string. */
export function stripPhoneFormatting(phone: string | null | undefined): string {
  return String(phone ?? "")
    .trim()
    .replace(/[\s\-()]/g, "");
}

/** Digits-only phone string for comparisons. */
export function normalizePhoneDigits(phone: string | null | undefined): string {
  return String(phone ?? "").replace(/\D/g, "");
}

/**
 * Normalize phone numbers to a consistent AU E.164 form (+614XXXXXXXX).
 * Strips all non-digit characters except a leading '+', then converts 04… to +614….
 */
export function normalizePhoneNumber(phone: string | null | undefined): string {
  const raw = String(phone ?? "").trim();
  if (!raw) return "";

  const hasLeadingPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("04")) {
    return `+614${digits.slice(2)}`;
  }

  if (digits.startsWith("61")) {
    return `+${digits}`;
  }

  if (digits.startsWith("4") && digits.length >= 9) {
    return `+61${digits}`;
  }

  if (hasLeadingPlus) {
    return `+${digits}`;
  }

  return "";
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
 * Format outbound AU numbers to E.164:
 * - Strip spaces, brackets, and dashes
 * - 04xxxxxxxx → +614xxxxxxxx
 * - 4xxxxxxxxx → +614xxxxxxxx
 */
export function formatOutboundPhoneE164(
  phone: string | null | undefined
): string | null {
  const stripped = stripPhoneFormatting(phone);
  if (!stripped) return null;

  if (stripped.startsWith("+")) {
    const digits = stripped.slice(1).replace(/\D/g, "");
    return digits.length >= 8 ? `+${digits}` : null;
  }

  const digits = stripped.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("04")) {
    return `+614${digits.slice(2)}`;
  }

  if (digits.startsWith("4")) {
    return `+61${digits}`;
  }

  if (digits.startsWith("61")) {
    return `+${digits}`;
  }

  return null;
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
