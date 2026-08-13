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

    const payload = (await response.json()) as { error?: string; success?: boolean };

    if (!response.ok) {
      return { error: payload.error ?? "Failed to send reset email." };
    }

    return { error: null };
  } catch (cause) {
    return {
      error: cause instanceof Error ? cause.message : "Failed to send reset email.",
    };
  }
}
