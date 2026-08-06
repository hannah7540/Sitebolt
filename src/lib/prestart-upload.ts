import { uploadPrestartFile } from "./supabase";

/** Max base64 length to store inline (~500 KB) — signatures are well under this */
const MAX_INLINE_DATA_URL_LENGTH = 512_000;

export async function uploadDefectPhoto(
  file: File,
  path: string
): Promise<string | null> {
  try {
    const ext = file.name.split(".").pop() ?? "jpg";
    const { url, error } = await uploadPrestartFile(file, `${path}.${ext}`);
    if (!error && url) return url;
    console.warn("Defect photo upload failed, continuing without photo:", error);
    return null;
  } catch (err) {
    console.warn("Defect photo upload error, continuing without photo:", err);
    return null;
  }
}

export async function uploadSignature(
  signatureDataUrl: string,
  path: string
): Promise<string | null> {
  try {
    const sigBlob = await fetch(signatureDataUrl).then((r) => r.blob());
    const { url, error } = await uploadPrestartFile(sigBlob, path);
    if (!error && url) return url;

    console.warn(
      "Signature storage upload failed, falling back to inline data URL:",
      error
    );
    return inlineSignatureFallback(signatureDataUrl);
  } catch (err) {
    console.warn(
      "Signature upload error, falling back to inline data URL:",
      err
    );
    return inlineSignatureFallback(signatureDataUrl);
  }
}

function inlineSignatureFallback(signatureDataUrl: string): string | null {
  if (signatureDataUrl.length <= MAX_INLINE_DATA_URL_LENGTH) {
    return signatureDataUrl;
  }
  console.warn("Signature data URL too large for inline storage, saving as null");
  return null;
}
