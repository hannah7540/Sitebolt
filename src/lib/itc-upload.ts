import {
  ITC_ATTACHMENTS_BUCKET,
  logStorageUploadError,
  uploadSignatureBlob,
  uploadToStorageBucket,
} from "./itp-itc-storage";

const MAX_WIDTH = 1600;
const JPEG_QUALITY = 0.82;

export interface CompressedPhotoResult {
  file: File;
  gpsLat: number | null;
  gpsLng: number | null;
  capturedAt: string;
}

function readGpsPosition(): Promise<GeolocationPosition | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 }
    );
  });
}

async function compressImageFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return file;

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), "image/jpeg", JPEG_QUALITY);
  });

  if (!blob) return file;

  const baseName = file.name.replace(/\.[^.]+$/, "") || "itc-photo";
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
}

export async function prepareItcPhotoUpload(
  file: File
): Promise<CompressedPhotoResult> {
  const [compressed, position] = await Promise.all([
    compressImageFile(file),
    readGpsPosition(),
  ]);

  return {
    file: compressed,
    gpsLat: position?.coords.latitude ?? null,
    gpsLng: position?.coords.longitude ?? null,
    capturedAt: new Date().toISOString(),
  };
}

export async function uploadItcPhoto(input: {
  projectId: string;
  itcId: string;
  slotKey: string;
  file: File;
}): Promise<{ url: string | null; error: string | null }> {
  try {
    const prepared = await prepareItcPhotoUpload(input.file);
    const result = await uploadToStorageBucket({
      bucket: ITC_ATTACHMENTS_BUCKET,
      pathPrefix: `${input.projectId}/${input.itcId}`,
      file: prepared.file,
      fileName: `${input.slotKey}.jpg`,
      contentType: prepared.file.type || "image/jpeg",
    });

    if (result.error) {
      logStorageUploadError("uploadItcPhoto", result.error);
    }

    return { url: result.url, error: result.error };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Photo upload failed";
    logStorageUploadError("uploadItcPhoto", message);
    return { url: null, error: message };
  }
}

export async function uploadItcSignature(input: {
  projectId: string;
  itcId: string;
  stepKey: string;
  blob: Blob;
}): Promise<{ url: string | null; error: string | null }> {
  const result = await uploadSignatureBlob({
    pathPrefix: `${input.projectId}/${input.itcId}/signatures/${input.stepKey}`,
    blob: input.blob,
    fileName: "signature.png",
  });

  if (result.error) {
    logStorageUploadError("uploadItcSignature", result.error);
  }

  return result;
}

export async function uploadItcMarkup(input: {
  projectId: string;
  discipline: string;
  file: File;
}): Promise<{ url: string | null; error: string | null }> {
  try {
    const ext = input.file.name.split(".").pop() || "pdf";
    const result = await uploadToStorageBucket({
      bucket: ITC_ATTACHMENTS_BUCKET,
      pathPrefix: `${input.projectId}/redlines`,
      file: input.file,
      fileName: `${input.discipline}.${ext}`,
      contentType: input.file.type || "application/octet-stream",
    });

    if (result.error) {
      logStorageUploadError("uploadItcMarkup", result.error);
    }

    return { url: result.url, error: result.error };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Redline upload failed";
    logStorageUploadError("uploadItcMarkup", message);
    return { url: null, error: message };
  }
}
