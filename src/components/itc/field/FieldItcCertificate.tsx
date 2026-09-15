"use client";

import { useEffect, useState } from "react";
import { Loader2, Printer } from "lucide-react";
import {
  FIELD_ITC_FORM_STEPS,
  FIELD_ITC_PHOTO_SLOTS,
  getItcCertificateBundle,
  photoForSlot,
  type FieldItcPhoto,
  type FieldItcRecord,
  type FieldItcSignoff,
} from "@/lib/api/itc";
import { generateItcCertificatePdf } from "@/lib/itc-pdf";
import { cardClass } from "@/lib/ui-classes";

interface FieldItcCertificateProps {
  itc: FieldItcRecord;
  projectName: string;
  photos: FieldItcPhoto[];
  signoffs: FieldItcSignoff[];
}

export default function FieldItcCertificate({
  itc,
  projectName,
  photos,
  signoffs,
}: FieldItcCertificateProps) {
  const [pdfBusy, setPdfBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [bundleReady, setBundleReady] = useState(false);

  useEffect(() => {
    setBundleReady(true);
  }, [itc.id]);

  const handlePdf = async () => {
    setPdfBusy(true);
    setMessage(null);
    try {
      const bundle = await getItcCertificateBundle(itc.id);
      if (!bundle) {
        setMessage("Certificate data is not available for this ITC yet.");
        return;
      }
      const blob = await generateItcCertificatePdf(bundle, {
        projectName,
        packageName: itc.building ?? projectName,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${itc.itc_number}-ITC.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "PDF generation failed.");
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className={`${cardClass} overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 print:hidden">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Certificate preview</h2>
          <p className="text-xs text-slate-500">{itc.itc_number}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
          <button
            type="button"
            disabled={pdfBusy || !bundleReady}
            onClick={() => void handlePdf()}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white"
          >
            {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Download PDF
          </button>
        </div>
      </div>
      {message ? <p className="px-4 pt-3 text-sm text-red-600 print:hidden">{message}</p> : null}

      <div className="space-y-4 p-4">
        <div className="grid gap-px overflow-hidden rounded-lg border border-slate-300 bg-slate-300 text-sm">
          <div className="grid grid-cols-4 bg-white">
            <div className="border-r border-slate-200 p-2 font-semibold">Project</div>
            <div className="border-r border-slate-200 p-2">{projectName}</div>
            <div className="border-r border-slate-200 p-2 font-semibold">ITC No</div>
            <div className="p-2">{itc.itc_number}</div>
          </div>
          <div className="grid grid-cols-4 bg-white">
            <div className="border-r border-slate-200 p-2 font-semibold">Zone</div>
            <div className="border-r border-slate-200 p-2">{itc.zone_code ?? "—"}</div>
            <div className="border-r border-slate-200 p-2 font-semibold">Building</div>
            <div className="p-2">{itc.building ?? "—"}</div>
          </div>
          <div className="grid grid-cols-4 bg-white">
            <div className="border-r border-slate-200 p-2 font-semibold">Service</div>
            <div className="border-r border-slate-200 p-2">{itc.service_name ?? "—"}</div>
            <div className="border-r border-slate-200 p-2 font-semibold">Length</div>
            <div className="p-2">{itc.length_m != null ? `${itc.length_m} m` : "—"}</div>
          </div>
          <div className="grid grid-cols-4 bg-white">
            <div className="border-r border-slate-200 p-2 font-semibold">From</div>
            <div className="border-r border-slate-200 p-2">{itc.start_location ?? "—"}</div>
            <div className="border-r border-slate-200 p-2 font-semibold">To</div>
            <div className="p-2">{itc.end_location ?? "—"}</div>
          </div>
          <div className="grid grid-cols-4 bg-white">
            <div className="border-r border-slate-200 p-2 font-semibold">Material</div>
            <div className="border-r border-slate-200 p-2">{itc.material_and_size ?? itc.conduits_label}</div>
            <div className="border-r border-slate-200 p-2 font-semibold">Drawing rev</div>
            <div className="p-2">{itc.drawing_rev ?? "—"}</div>
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Inspection steps</h3>
          <table className="min-w-full border border-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Activity</th>
                <th className="px-3 py-2">Signed by</th>
                <th className="px-3 py-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {FIELD_ITC_FORM_STEPS.map((step) => {
                const signoff = signoffs.find((row) => row.step_index === step.step_index);
                return (
                  <tr key={step.step_key} className="border-t border-slate-100">
                    <td className="px-3 py-2">{step.step_index + 1}</td>
                    <td className="px-3 py-2">{step.title}</td>
                    <td className="px-3 py-2">{signoff?.author_name ?? "—"}</td>
                    <td className="px-3 py-2">
                      {signoff?.submitted_at ? signoff.submitted_at.slice(0, 10) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Photo QA</h3>
          <div className="grid grid-cols-3 gap-2">
            {FIELD_ITC_PHOTO_SLOTS.map((slot) => {
              const photo = photoForSlot(photos, slot.key);
              return (
                <div key={slot.key} className="overflow-hidden rounded border border-slate-200">
                  <p className="bg-slate-50 px-2 py-1 text-[11px] font-semibold uppercase text-slate-500">
                    {slot.label}
                  </p>
                  {photo?.photo_url && !photo.not_required ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo.photo_url} alt={slot.label} className="h-24 w-full object-cover" />
                  ) : (
                    <div className="flex h-24 items-center justify-center text-xs text-slate-400">
                      {photo?.not_required ? "N/A" : "Missing"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
