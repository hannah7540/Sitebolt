"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Printer, X } from "lucide-react";
import type { Asset } from "@/lib/assets";
import { ASSET_TYPE_LABELS } from "@/lib/assets";
import {
  drawQrToCanvas,
  downloadQrSvg,
  generateQrSvg,
  getAssetScanUrl,
} from "@/lib/qr-code";
import CompanyLogo from "@/components/ui/CompanyLogo";
import { modalClass, modalOverlayClass } from "@/lib/ui-classes";

interface AssetQRModalProps {
  asset: Asset;
  onClose: () => void;
}

export default function AssetQRModal({ asset, onClose }: AssetQRModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const scanUrl = getAssetScanUrl(asset.id);
  const [svgMarkup, setSvgMarkup] = useState("");

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    setSvgMarkup(generateQrSvg(scanUrl));
    if (canvasRef.current) {
      drawQrToCanvas(canvasRef.current, scanUrl, 200);
    }
  }, [scanUrl]);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html><head><title>QR - ${asset.asset_number}</title>
      <style>
        body { font-family: system-ui, sans-serif; text-align: center; padding: 40px; }
        h1 { font-size: 28px; margin-bottom: 8px; }
        p { color: #666; margin: 4px 0; }
        .url { font-size: 12px; word-break: break-all; margin-top: 16px; }
      </style></head><body>
        ${content.innerHTML}
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  return (
    <div className={modalOverlayClass}>
      <div className={`${modalClass} max-w-md`}>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded p-1 text-slate-500 hover:text-slate-900"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div ref={printRef} className="flex flex-col items-center">
          <div className="mb-4 flex w-full items-center justify-center">
            <CompanyLogo size="lg" showFallback />
          </div>
          <p className="mb-1 text-xs font-bold uppercase tracking-widest text-orange-500">
            Asset QR Code
          </p>
          <h2 className="text-2xl font-bold text-slate-900">{asset.asset_number}</h2>
          <p className="text-sm text-slate-600">{asset.name}</p>
          <p className="mt-1 text-xs text-slate-500">
            {ASSET_TYPE_LABELS[asset.asset_type]} · Scan to view asset
          </p>

          <div className="my-6 rounded-xl bg-white p-4">
            <canvas ref={canvasRef} width={200} height={200} aria-label="Asset QR code" />
            {svgMarkup ? (
              <div
                className="sr-only"
                dangerouslySetInnerHTML={{ __html: svgMarkup }}
              />
            ) : null}
          </div>

          <p className="max-w-xs text-xs text-slate-500 break-all">{scanUrl}</p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handlePrint}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-600 py-3 font-semibold text-white hover:bg-orange-500"
          >
            <Printer className="h-4 w-4" /> Print QR Code
          </button>
          <button
            type="button"
            onClick={() => downloadQrSvg(scanUrl, `${asset.asset_number}-qr.svg`)}
            className="flex items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 py-3 text-slate-600 hover:bg-orange-50"
          >
            <Download className="h-4 w-4" /> Download SVG
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-100 px-4 py-3 text-slate-600 hover:bg-orange-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
