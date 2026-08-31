import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email-service";
import { getSiteUrl } from "@/lib/supabase/env";
import { buildWorkerDeepLinkPath } from "@/lib/worker-deep-links";

/**
 * Email workers about a new SWMS assignment with a deep link into the dashboard.
 * Native push send is not wired yet (device tokens are local-only); realtime on
 * `swms_assignments` plus this email cover outstanding-item visibility.
 */
export async function notifyWorkersOfSwmsAssignment(
  admin: SupabaseClient,
  input: {
    workerIds: string[];
    swmsTitle: string;
  }
): Promise<{ emailed: number; errors: string[] }> {
  const uniqueIds = [
    ...new Set(input.workerIds.map((id) => id.trim()).filter(Boolean)),
  ];
  if (uniqueIds.length === 0) {
    return { emailed: 0, errors: [] };
  }

  const { data: workers, error } = await admin
    .from("workers")
    .select("id, email, full_name, first_name, last_name")
    .in("id", uniqueIds);

  if (error) {
    return { emailed: 0, errors: [error.message] };
  }

  const title = input.swmsTitle.trim() || "SWMS";
  const siteUrl = getSiteUrl().replace(/\/$/, "");
  let emailed = 0;
  const errors: string[] = [];

  for (const row of workers ?? []) {
    const workerId = String((row as { id?: string }).id ?? "").trim();
    const email = String((row as { email?: string | null }).email ?? "")
      .trim()
      .toLowerCase();
    if (!workerId || !email || !email.includes("@")) continue;

    const deepLink = `${siteUrl}${buildWorkerDeepLinkPath(
      { type: "swms" },
      workerId
    )}`;

    const result = await sendEmail({
      to: [email],
      subject: `SWMS sign-off required: ${title}`,
      text: [
        `You have been assigned a SWMS that requires your sign-off: ${title}.`,
        "",
        `Open your worker dashboard to review and sign:`,
        deepLink,
      ].join("\n"),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
          <h2 style="margin:0 0 12px">SWMS sign-off required</h2>
          <p style="margin:0 0 16px">
            You have been assigned <strong>${escapeHtml(title)}</strong> and need to
            complete the sign-off.
          </p>
          <p style="margin:0 0 24px">
            <a href="${deepLink}" style="display:inline-block;background:#ea580c;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">
              Open Worker Dashboard
            </a>
          </p>
        </div>
      `,
    });

    if (result.sent) {
      emailed += 1;
    } else if (result.error) {
      errors.push(`${email}: ${result.error}`);
    }
  }

  return { emailed, errors };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
