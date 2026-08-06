"use client";

import { useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Printer, X } from "lucide-react";
import type { PlantAsset } from "@/lib/supabase";
import { getPrestartUrl } from "@/lib/supabase";
import { PRESTART_TEMPLATE_LABELS } from "@/lib/prestart-templates";
import CompanyLogo from "@/components/ui/CompanyLogo";
import { modalClass, modalOverlayClass } from "@/lib/ui-classes";

interface PlantQRModalProps {
  plant: PlantAsset;
  onClose: () => void;
}

export default function PlantQRModal({ plant, onClose }: PlantQRModalProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const prestartUrl = getPrestartUrl(plant.id);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html><head><title>QR - ${plant.unit_number}</title>
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
            Plant Pre-Start
          </p>
          <h2 className="text-2xl font-bold text-slate-900">{plant.unit_number}</h2>
          <p className="text-sm text-slate-600">
            {[plant.make, plant.model].filter(Boolean).join(" ")}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {plant.prestart_template
              ? PRESTART_TEMPLATE_LABELS[plant.prestart_template]
              : "Excavator"}{" "}
            · Scan to complete daily pre-start
          </p>

          <div className="my-6 rounded-xl bg-white p-4">
            <QRCodeSVG value={prestartUrl} size={200} level="H" />
          </div>

          <p className="url max-w-xs text-xs text-slate-500">{prestartUrl}</p>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={handlePrint}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-600 py-3 font-semibold text-white hover:bg-orange-500"
          >
            <Printer className="h-4 w-4" /> Print QR Code
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
