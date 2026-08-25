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

/** Best-effort E.164 for AU mobiles (04xxxxxxxx → +614xxxxxxxx). */
export function toE164Phone(phone: string | null | undefined): string | null {
  const raw = String(phone ?? "").trim();
  if (!raw) return null;

  if (raw.startsWith("+")) {
    const digits = normalizePhoneDigits(raw);
    return digits.length >= 8 ? `+${digits}` : null;
  }

  const digits = normalizePhoneDigits(raw);
  if (!digits) return null;

  // Australian mobile: 04xxxxxxxx (10 digits)
  if (/^04\d{8}$/.test(digits)) {
    return `+61${digits.slice(1)}`;
  }

  // Already includes country code without plus: 614xxxxxxxx
  if (/^614\d{8}$/.test(digits)) {
    return `+${digits}`;
  }

  // Other AU numbers with leading 0: 0XXXXXXXXX
  if (digits.startsWith("0") && digits.length >= 9 && digits.length <= 10) {
    return `+61${digits.slice(1)}`;
  }

  // Country code 61 without leading 0 on local part
  if (digits.startsWith("61") && digits.length >= 11 && digits.length <= 12) {
    return `+${digits}`;
  }

  // 9-digit mobile missing leading 0 (412345678)
  if (/^4\d{8}$/.test(digits)) {
    return `+61${digits}`;
  }

  return null;
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
