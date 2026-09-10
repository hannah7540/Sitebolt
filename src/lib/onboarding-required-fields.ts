export const ONBOARDING_REQUIRED_TOAST =
  "Please complete all mandatory fields before proceeding.";

export const ONBOARDING_FIELD_REQUIRED = "This field is required";

export type OnboardingFieldError = {
  field: string;
  message: string;
};

export function isOnboardingValueBlank(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "boolean") return false;
  if (typeof value === "string") return value.trim().length === 0;
  if (typeof File !== "undefined" && value instanceof File) return value.size === 0;
  return false;
}

export function firstMissingOnboardingField(
  checks: Array<{ field: string; value: unknown }>
): OnboardingFieldError | null {
  for (const check of checks) {
    if (isOnboardingValueBlank(check.value)) {
      return { field: check.field, message: ONBOARDING_FIELD_REQUIRED };
    }
  }
  return null;
}

export function missingOnboardingFields(
  checks: Array<{ field: string; value: unknown }>
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const check of checks) {
    if (isOnboardingValueBlank(check.value)) {
      errors[check.field] = ONBOARDING_FIELD_REQUIRED;
    }
  }
  return errors;
}

export function scrollToOnboardingField(field: string): void {
  if (typeof document === "undefined") return;
  const el = document.querySelector<HTMLElement>(
    `[data-onboarding-field="${field}"]`
  );
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  const focusable = el.matches("input, textarea, select, button")
    ? el
    : el.querySelector<HTMLElement>("input, textarea, select, button");
  focusable?.focus();
}
