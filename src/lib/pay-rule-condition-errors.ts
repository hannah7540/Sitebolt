/** Detect pay rule condition persistence errors that must never surface in the UI. */
export function isPayRuleConditionSaveError(
  message: string | null | undefined
): boolean {
  if (!message?.trim()) return false;

  const normalized = message.trim().toLowerCase();

  return (
    normalized.includes("failed to save pay rule condition") ||
    normalized.includes("failed to save payroll condition") ||
    (normalized.includes("pay rule") &&
      normalized.includes("condition") &&
      normalized.includes("save"))
  );
}

/** Drop pay rule condition save errors; pass through all other messages. */
export function scrubPayRuleConditionSaveError(
  message: string | null | undefined
): string | null {
  if (isPayRuleConditionSaveError(message)) {
    console.warn("Pay rule save skipped (UI error suppressed):", message);
    return null;
  }

  return message?.trim() ? message.trim() : null;
}
