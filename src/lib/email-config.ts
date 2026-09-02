/** Default transactional sender for Resend + in-app notifications. */
export const DEFAULT_SYSTEM_FROM_ADDRESS = "hannah@site-bolt.com.au";

/** Public support inbox shown in transactional email footers. */
export const SITEBOLT_SUPPORT_EMAIL = "admin@site-bolt.com.au";

export const DEFAULT_SYSTEM_FROM_NAME = "Site Bolt";

export const DEFAULT_SYSTEM_FROM_EMAIL = `${DEFAULT_SYSTEM_FROM_NAME} <${DEFAULT_SYSTEM_FROM_ADDRESS}>`;

function normalizeFromAddress(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_SYSTEM_FROM_EMAIL;

  if (trimmed.includes("<") && trimmed.includes(">")) {
    return trimmed;
  }

  return `${DEFAULT_SYSTEM_FROM_NAME} <${trimmed}>`;
}

/** Resolve the system "From" header, honoring env overrides with a safe default. */
export function resolveSystemFromEmail(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_FROM_EMAIL,
    process.env.SENDER_EMAIL,
    process.env.RESEND_FROM_EMAIL,
    process.env.EXPIRY_ALERT_FROM_EMAIL,
  ];

  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) {
      return normalizeFromAddress(trimmed);
    }
  }

  return DEFAULT_SYSTEM_FROM_EMAIL;
}
