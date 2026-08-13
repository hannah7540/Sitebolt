/** Request a password reset email via the Resend-backed API route. */
export async function requestPasswordResetEmail(
  email: string
): Promise<{ error: string | null }> {
  const trimmed = email.trim();
  if (!trimmed) {
    return { error: "Enter your email address." };
  }

  try {
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: trimmed }),
    });

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      if (payload && typeof payload === "object") {
        const apiError = (payload as { error?: unknown }).error;
        if (typeof apiError === "string" && apiError.trim()) {
          return { error: apiError.trim() };
        }
        if (
          apiError &&
          typeof apiError === "object" &&
          "message" in apiError &&
          typeof (apiError as { message?: unknown }).message === "string"
        ) {
          return { error: (apiError as { message: string }).message };
        }
      }
      return { error: "Failed to send reset email." };
    }

    return { error: null };
  } catch (cause) {
    return {
      error: cause instanceof Error ? cause.message : "Failed to send reset email.",
    };
  }
}
