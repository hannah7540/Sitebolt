"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, FileDown, Loader2 } from "lucide-react";
import ItcFieldPhotoGallery from "@/components/itc/ItcFieldPhotoGallery";
import ItcRedlineViewer from "@/components/itc/ItcRedlineViewer";
import ItcStepSignoffCard from "@/components/itc/ItcStepSignoffCard";
import {
  createItcChangeRequest,
  updateItcGpsLocation,
  type ItcDetailBundle,
  type ItcSignoff,
} from "@/lib/itc-service";
import { fetchItcMasterSpecs } from "@/lib/itc-master-spec-service";
import { readBrowserGeolocation } from "@/lib/itc-compaction-service";
import { downloadItcPdf, generateItcCertificatePdf } from "@/lib/itc-pdf";
import { cardClass } from "@/lib/ui-classes";

interface ItcDetailViewProps {
  projectId: string;
  projectName: string;
  bundle: ItcDetailBundle;
  workerId: string;
  workerName: string;
  isAdmin?: boolean;
  onBack: () => void;
  onUpdated: () => void;
}

function getSignoffForStep(
  signoffs: ItcSignoff[],
  stepIndex: number,
  authorId: string
): ItcSignoff | undefined {
  return signoffs.find(
    (row) => row.step_index === stepIndex && row.author_id === authorId
  );
}

export default function ItcDetailView({
  projectId,
  projectName,
  bundle,
  workerId,
  workerName,
  isAdmin = false,
  onBack,
  onUpdated,
}: ItcDetailViewProps) {
  const { itc, stepPhotos, signoffs, changeRequests, steps } = bundle;
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [roverOptions, setRoverOptions] = useState<string[]>([]);
  const [operatorOptions, setOperatorOptions] = useState<string[]>([]);
  const [gpsMessage, setGpsMessage] = useState<string | null>(null);
  const [masterRedlineUrl, setMasterRedlineUrl] = useState<string | null>(null);

  useEffect(() => {
    void fetchItcMasterSpecs(projectId).then((specs) => {
      const discipline =
        (itc.trade_discipline as "Electrical" | "Drainage" | "Hydraulics" | null) ??
        (itc.service_discipline as "Electrical" | "Drainage" | "Hydraulics");
      const spec = specs.find((row) => row.discipline === discipline) ?? specs[0];
      setRoverOptions(spec?.rover_serial_numbers ?? []);
      setOperatorOptions(spec?.rover_operators ?? []);
      setMasterRedlineUrl(spec?.redline_markup_url ?? null);
    });
  }, [projectId, itc.trade_discipline, itc.service_discipline]);

  const redlineUrl = itc.redline_markup_url ?? masterRedlineUrl;

  const handleCaptureGps = () => {
    setGpsLoading(true);
    void readBrowserGeolocation().then(async (position) => {
      if (!position) {
        setGpsMessage("Could not read GPS.");
        setGpsLoading(false);
        return;
      }
      const result = await updateItcGpsLocation({
        itcId: itc.id,
        projectId,
        gpsLat: position.lat,
        gpsLng: position.lng,
      });
      setGpsMessage(
        result.error ??
          (result.linkedTests?.length
            ? `GPS saved. Auto-linked compaction test(s): ${result.linkedTests.join(", ")}`
            : `GPS saved: ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`)
      );
      setGpsLoading(false);
      if (!result.error) onUpdated();
    });
  };

  const handleChangeRequest = async (stepIndex: number) => {
    const reason = window.prompt("Describe the required change:");
    if (!reason?.trim()) return;

    const signoff = getSignoffForStep(signoffs, stepIndex, workerId);
    setLoading(true);
    const result = await createItcChangeRequest({
      itcId: itc.id,
      signoffId: signoff?.id ?? null,
      requestedBy: workerId,
      requestedByName: workerName,
      reason: reason.trim(),
    });
    setLoading(false);
    setMessage(result.error ?? "Change request sent to admin queue.");
    if (!result.error) onUpdated();
  };

  const handleGeneratePdf = async () => {
    setPdfLoading(true);
    try {
      const blob = await generateItcCertificatePdf(bundle, {
        projectName,
        projectNo: projectId,
        packageName: itc.package_name ?? projectName,
        clientName: itc.client_name ?? undefined,
        subcontractorName: itc.subcontractor_name ?? itc.assigned_name ?? undefined,
      });
      downloadItcPdf(blob, `${itc.itc_number}-certificate.pdf`);
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Register
        </button>
        <button
          type="button"
          onClick={() => void handleGeneratePdf()}
          disabled={pdfLoading}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
        >
          {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
          Generate PDF
        </button>
      </div>

      <div className={cardClass}>
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-xl font-bold text-slate-900">{itc.itc_number}</h2>
          <p className="text-sm text-slate-500">
            {itc.zone_code} · {itc.building ?? "General"} · {itc.start_location} →{" "}
            {itc.end_location}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {itc.service_discipline}
            {itc.trade_discipline ? ` · ${itc.trade_discipline}` : ""} · Progress{" "}
            {itc.progress_percent}%
          </p>
        </div>
      </div>

      <ItcRedlineViewer
        markupUrl={redlineUrl}
        gpsLat={itc.gps_lat}
        gpsLng={itc.gps_lng}
        onCaptureGps={handleCaptureGps}
        gpsLoading={gpsLoading}
        gpsMessage={gpsMessage}
      />

      <ItcFieldPhotoGallery
        projectId={projectId}
        itcId={itc.id}
        photos={stepPhotos}
        uploadedBy={workerId}
        uploadedByName={workerName}
        isAdmin={isAdmin}
        adminId={workerId}
        adminName={workerName}
        onUpdated={onUpdated}
      />

      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Inspection Steps</h3>
          <p className="text-sm text-slate-500">
            Complete each step in order. Earlier steps lock after submission and unlock the next
            step automatically.
          </p>
        </div>

        {steps.map((step, index) => (
          <ItcStepSignoffCard
            key={step.step_key}
            projectId={projectId}
            itcId={itc.id}
            step={step}
            stepNumber={index + 1}
            signoff={getSignoffForStep(signoffs, step.step_index, workerId)}
            allSignoffs={signoffs}
            workerId={workerId}
            workerName={workerName}
            isAdmin={isAdmin}
            roverOptions={roverOptions}
            operatorOptions={operatorOptions}
            onUpdated={onUpdated}
            onChangeRequest={() => void handleChangeRequest(step.step_index)}
          />
        ))}
      </div>

      {changeRequests.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {changeRequests.length} open change request(s) on this ITC.
        </div>
      ) : null}

      {message ? <p className="text-sm text-slate-600">{message}</p> : null}
      {loading ? (
        <p className="inline-flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Processing…
        </p>
      ) : null}
    </div>
  );
}
