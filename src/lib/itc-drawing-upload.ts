import {
  ITP_ATTACHMENTS_BUCKET,
  ITP_DRAWINGS_BUCKET,
  buildUniqueStorageFileName,
  logStorageUploadError,
  uploadToStorageBucket,
} from "./itp-itc-storage";

export { ITP_DRAWINGS_BUCKET };

export interface ItcDrawingUploadResult {
  url: string | null;
  localDataUrl: string | null;
  usedLocalFallback: boolean;
  error: string | null;
}

function isStorageBucketError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("bucket") ||
    lower.includes("not found") ||
    lower.includes("does not exist") ||
    lower.includes("invalid bucket") ||
    lower.includes("schema cache")
  );
}

export function readLocalDrawingPreview(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read drawing file"));
    reader.readAsDataURL(file);
  });
}

export async function uploadItcDrawingFile(input: {
  projectId: string;
  file: File;
}): Promise<ItcDrawingUploadResult> {
  let localDataUrl: string | null = null;

  try {
    localDataUrl = await readLocalDrawingPreview(input.file);
  } catch (error) {
    return {
      url: null,
      localDataUrl: null,
      usedLocalFallback: false,
      error: error instanceof Error ? error.message : "Failed to read drawing file",
    };
  }

  const extension = input.file.name.split(".").pop()?.toLowerCase() ?? "png";
  const fileName = buildUniqueStorageFileName(`drawing.${extension}`);

  const primary = await uploadToStorageBucket({
    bucket: ITP_DRAWINGS_BUCKET,
    pathPrefix: `${input.projectId}/drawings`,
    file: input.file,
    fileName,
    contentType: input.file.type || "application/octet-stream",
    fallbackBuckets: [ITP_ATTACHMENTS_BUCKET],
  });

  if (primary.url) {
    return {
      url: primary.url,
      localDataUrl,
      usedLocalFallback: false,
      error: null,
    };
  }

  if (primary.error && isStorageBucketError(primary.error)) {
    logStorageUploadError("uploadItcDrawingFile", primary.error);
    return {
      url: null,
      localDataUrl,
      usedLocalFallback: true,
      error: null,
    };
  }

  logStorageUploadError("uploadItcDrawingFile", primary.error ?? "Drawing upload failed");
  return {
    url: null,
    localDataUrl,
    usedLocalFallback: true,
    error: primary.error ?? "Drawing upload failed",
  };
}

export function sanitizeRelativeCoordinate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function getRelativeCanvasCoordinates(
  clientX: number,
  clientY: number,
  container: HTMLElement
): { x: number; y: number } {
  const rect = container.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: sanitizeRelativeCoordinate((clientX - rect.left) / rect.width),
    y: sanitizeRelativeCoordinate((clientY - rect.top) / rect.height),
  };
}
