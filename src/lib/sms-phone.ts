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

/** Match two phone numbers allowing country-code / leading-zero differences. */
export function phonesMatch(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  const a = normalizePhoneDigits(left);
  const b = normalizePhoneDigits(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const aTail = a.slice(-9);
  const bTail = b.slice(-9);
  return aTail.length >= 8 && aTail === bTail;
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
  const digits = normalizePhoneDigits(phone);
  if (!digits) return "";
  return digits.slice(-9) || digits;
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
