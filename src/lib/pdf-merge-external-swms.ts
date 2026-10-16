import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type ExternalPdfInsertion = {
  /** 0-based insert index in the original pack (page count after the SWMS header). */
  at: number;
  pdfBytes: Uint8Array;
};

export async function mergeExternalPdfsIntoPack(
  packBytes: ArrayBuffer | Uint8Array,
  insertions: ExternalPdfInsertion[]
): Promise<Uint8Array> {
  const pack = await PDFDocument.load(packBytes);
  let offset = 0;

  for (const insertion of insertions) {
    if (!insertion.pdfBytes?.byteLength) continue;
    try {
      const source = await PDFDocument.load(insertion.pdfBytes, {
        ignoreEncryption: true,
      });
      const copied = await pack.copyPages(source, source.getPageIndices());
      if (copied.length === 0) continue;
      const at = Math.max(0, Math.min(insertion.at + offset, pack.getPageCount()));
      copied.forEach((page, index) => {
        pack.insertPage(at + index, page);
      });
      offset += copied.length;
    } catch {
      // Skip unreadable/encrypted source PDFs; the signature log still remains.
    }
  }

  return pack.save();
}

export async function stampPdfPageNumbers(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const total = pages.length;

  pages.forEach((page, index) => {
    const { width } = page.getSize();
    page.drawText(`Page ${index + 1} of ${total}`, {
      x: Math.max(24, width - 72),
      y: 16,
      size: 8,
      font,
      color: rgb(0.58, 0.64, 0.72),
    });
  });

  return doc.save();
}
