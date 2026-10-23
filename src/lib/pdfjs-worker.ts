/** Public copy created by `scripts/copy-pdf-worker.cjs`. Never use a bundled dynamic import. */
export const PDFJS_WORKER_SRC = "/pdf.worker.min.mjs";

export function configurePdfjsWorker(pdfjs: {
  GlobalWorkerOptions: { workerSrc: string };
}): void {
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
}
