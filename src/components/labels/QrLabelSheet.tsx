"use client";

import { useEffect, useMemo, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Printer, X } from "lucide-react";
import CompanyLogo from "@/components/ui/CompanyLogo";
import { modalOverlayClass } from "@/lib/ui-classes";

export interface QrLabelItem {
  id: string;
  qrUrl: string;
  title: string;
  identity: string;
  makeModel: string;
  category: string;
  project?: string | null;
  state?: string | null;
}

interface QrLabelSheetProps {
  items: QrLabelItem[];
  heading: string;
  onClose: () => void;
}

export default function QrLabelSheet({ items, heading, onClose }: QrLabelSheetProps) {
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const cards = useMemo(
    () => items.filter((item) => item.id && item.qrUrl),
    [items]
  );

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${escapeHtml(heading)} — QR Labels</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #0f172a;
      font-family: system-ui, -apple-system, Segoe UI, sans-serif;
    }
    .qr-label-print-root { width: 100%; }
    .qr-label-card {
      box-sizing: border-box;
      height: 138mm;
      padding: 10mm 12mm;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      page-break-inside: avoid;
      break-inside: avoid;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
    }
    .qr-label-card:nth-child(odd) {
      margin-bottom: 6mm;
      border-bottom: 1px dashed #cbd5e1;
    }
    .qr-label-card:nth-child(2n) {
      page-break-after: always;
      break-after: page;
    }
    .qr-label-card:last-child {
      page-break-after: auto;
      break-after: auto;
      margin-bottom: 0;
    }
    .brand { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; }
    .brand img { height: 36px; width: auto; object-fit: contain; }
    .brand-mark { font-size: 13px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; color: #f97316; }
    h1 { font-size: 28px; margin: 8px 0 0; text-align: center; line-height: 1.15; }
    .identity { font-size: 16px; font-weight: 700; color: #334155; margin-top: 4px; }
    .meta { font-size: 14px; color: #475569; margin-top: 2px; }
    .badges { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-top: 8px; }
    .badge {
      border: 1px solid #e2e8f0;
      background: #f8fafc;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 10px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .qr-wrap { background: #fff; padding: 8px; }
    .instruct {
      width: 100%;
      box-sizing: border-box;
      border: 2px solid #fdba74;
      background: #fff7ed;
      color: #9a3412;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-align: center;
      padding: 10px 12px;
      border-radius: 6px;
    }
  </style>
</head>
<body>
  <div class="qr-label-print-root">
    ${content.innerHTML}
  </div>
</body>
</html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <div className={modalOverlayClass} style={{ zIndex: 70 }}>
      <div className="relative flex max-h-[min(92dvh,100%)] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:max-h-[92vh] sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 no-print">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{heading}</h2>
            <p className="text-sm text-slate-500">
              A4 portrait · exactly 2 labels per printed page
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:text-slate-900"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4">
          {cards.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              No equipment available to print.
            </p>
          ) : (
            <div ref={printRef} className="qr-label-print-root mx-auto max-w-[210mm] space-y-4 bg-white p-4">
              {cards.map((item) => (
                <article key={item.id} className="qr-label-card rounded-xl border-2 border-slate-200 p-6">
                  <div className="flex w-full items-center justify-center gap-3">
                    <CompanyLogo size="md" showFallback />
                    <span className="text-xs font-extrabold uppercase tracking-[0.18em] text-orange-500">
                      SiteBolt
                    </span>
                  </div>
                  <h3 className="mt-3 text-center text-2xl font-bold leading-tight text-slate-900">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-center text-base font-semibold text-slate-700">
                    {item.identity}
                  </p>
                  <p className="text-center text-sm text-slate-600">{item.makeModel}</p>
                  <p className="text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {item.category}
                  </p>
                  <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                    {item.project ? (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-700">
                        {item.project}
                      </span>
                    ) : null}
                    {item.state ? (
                      <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-orange-800">
                        {item.state}
                      </span>
                    ) : null}
                  </div>
                  <div className="my-4 flex justify-center">
                    <QRCodeSVG value={item.qrUrl} size={220} level="M" />
                  </div>
                  <div className="w-full rounded-md border-2 border-orange-300 bg-orange-50 px-3 py-2 text-center text-[11px] font-extrabold uppercase tracking-wider text-orange-800">
                    SCAN WITH PHONE CAMERA TO COMPLETE DAILY PRE-START
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3 border-t border-slate-200 px-5 py-4 no-print">
          <button
            type="button"
            onClick={handlePrint}
            disabled={cards.length === 0}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-600 py-3 font-semibold text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Printer className="h-4 w-4" /> Print QR Labels (2 per page)
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
