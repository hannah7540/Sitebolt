export const SWMS_DOCUMENTS_BUCKET = "swms-documents";
export const EXTERNAL_SWMS_SIGNED_URL_SECONDS = 60 * 60 * 24;
export const EXTERNAL_SWMS_MAX_BYTES = 25 * 1024 * 1024;

export function isExternalSwms(doc: {
  is_external?: boolean | null;
} | null | undefined): boolean {
  return Boolean(doc?.is_external);
}

export function formatExternalCompanyName(
  value: string | null | undefined
): string {
  return String(value ?? "").trim();
}

export function sanitizeSwmsStorageKey(rawName: string): string {
  const ext = rawName.split(".").pop() || "pdf";
  const base = rawName
    .replace(/\.[^/.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base || "document"}.${ext.toLowerCase() === "pdf" ? "pdf" : "pdf"}`;
}

export function normalizeSwmsStoragePath(value: string | null | undefined): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      const markers = [
        `/object/public/${SWMS_DOCUMENTS_BUCKET}/`,
        `/object/sign/${SWMS_DOCUMENTS_BUCKET}/`,
        `/object/authenticated/${SWMS_DOCUMENTS_BUCKET}/`,
      ];
      for (const marker of markers) {
        const index = url.pathname.indexOf(marker);
        if (index >= 0) {
          return decodeURIComponent(url.pathname.slice(index + marker.length));
        }
      }
    }
  } catch {
    // Fall through to the raw path.
  }

  return trimmed.replace(/^\/+/, "").replace(new RegExp(`^${SWMS_DOCUMENTS_BUCKET}/`), "");
}
