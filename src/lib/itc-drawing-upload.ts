import { supabase } from "./supabase";

export const ITP_DRAWINGS_BUCKET = "itp-drawings";

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

  try {
    const extension = input.file.name.split(".").pop()?.toLowerCase() ?? "png";
    const path = `${input.projectId}/drawings/${Date.now()}.${extension}`;

    const { error } = await supabase.storage
      .from(ITP_DRAWINGS_BUCKET)
      .upload(path, input.file, {
        cacheControl: "3600",
        upsert: true,
        contentType: input.file.type || "application/octet-stream",
      });

    if (error) {
      if (isStorageBucketError(error.message)) {
        return {
          url: null,
          localDataUrl,
          usedLocalFallback: true,
          error: null,
        };
      }

      return {
        url: null,
        localDataUrl,
        usedLocalFallback: true,
        error: error.message,
      };
    }

    const { data } = supabase.storage.from(ITP_DRAWINGS_BUCKET).getPublicUrl(path);
    return {
      url: data.publicUrl,
      localDataUrl,
      usedLocalFallback: false,
      error: null,
    };
  } catch (error) {
    return {
      url: null,
      localDataUrl,
      usedLocalFallback: true,
      error: error instanceof Error ? error.message : "Drawing upload failed",
    };
  }
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
