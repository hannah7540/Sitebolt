import {
  ITP_ATTACHMENTS_BUCKET,
  ITP_SIGNATURES_BUCKET,
  logStorageUploadError,
  uploadSignatureBlob,
  uploadToStorageBucket,
} from "./itp-itc-storage";

export async function uploadItpFile(
  file: File | Blob,
  pathPrefix: string,
  fileName: string,
  contentType?: string
): Promise<{ url: string | null; error: string | null }> {
  const result = await uploadToStorageBucket({
    bucket: ITP_ATTACHMENTS_BUCKET,
    pathPrefix,
    file,
    fileName,
    contentType: contentType || (file instanceof File ? file.type : undefined),
  });
  return { url: result.url, error: result.error };
}

export async function uploadItpPhoto(
  file: File,
  itpId: string,
  itemId: string
): Promise<{ url: string | null; error: string | null }> {
  const result = await uploadToStorageBucket({
    bucket: ITP_ATTACHMENTS_BUCKET,
    pathPrefix: `${itpId}/${itemId}`,
    file,
    fileName: file.name || "photo.jpg",
    contentType: file.type || "image/jpeg",
  });

  if (result.error) {
    logStorageUploadError("uploadItpPhoto", result.error);
  }

  return { url: result.url, error: result.error };
}

export async function uploadItpSignature(
  dataUrl: string,
  itpId: string,
  itemId: string
): Promise<{ url: string | null; error: string | null }> {
  try {
    const blob = await fetch(dataUrl).then((response) => response.blob());
    const result = await uploadSignatureBlob({
      pathPrefix: `${itpId}/${itemId}`,
      blob,
      fileName: "signature.png",
    });

    if (result.error) {
      logStorageUploadError("uploadItpSignature", result.error);
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Signature upload failed";
    logStorageUploadError("uploadItpSignature", message);
    return { url: null, error: message };
  }
}
