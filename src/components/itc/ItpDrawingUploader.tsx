"use client";

import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import ItcPinQuickModal from "@/components/itc/ItcPinQuickModal";
import type { ItcDrawingPin, ItcProjectDrawing } from "@/lib/itc-batch-service";
import { saveDrawingPin, uploadProjectDrawing } from "@/lib/itc-batch-service";
import { ITC_SERVICE_TYPE_COLORS } from "@/lib/itc-batch-templates";
import {
  getRelativeCanvasCoordinates,
  readLocalDrawingPreview,
  sanitizeRelativeCoordinate,
  uploadItcDrawingFile,
} from "@/lib/itc-drawing-upload";
import { cardClass } from "@/lib/ui-classes";

export interface ItpDrawingUploaderProps {
  projectId: string;
  uploadedBy?: string;
  pins: ItcDrawingPin[];
  onDrawingUploaded: (drawing: ItcProjectDrawing) => void;
  onPinAdded: (pin: ItcDrawingPin) => void;
}

function buildLocalDrawingRecord(input: {
  projectId: string;
  fileName: string;
  fileType: string;
  previewUrl: string;
  uploadedBy?: string;
}): ItcProjectDrawing {
  return {
    id: `local-drawing-${Date.now()}`,
    project_id: input.projectId,
    file_name: input.fileName,
    file_url: input.previewUrl,
    file_type: input.fileType || "image/png",
    uploaded_by: input.uploadedBy ?? null,
  };
}

export default function ItpDrawingUploader({
  projectId,
  uploadedBy,
  pins,
  onDrawingUploaded,
  onPinAdded,
}: ItpDrawingUploaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [drawing, setDrawing] = useState<ItcProjectDrawing | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingCoords, setPendingCoords] = useState<{ x: number; y: number } | null>(null);

  const handleUpload = async (file: File) => {
    setLoading(true);
    setMessage(null);

    try {
      const localPreview = await readLocalDrawingPreview(file);
      setPreviewUrl(localPreview);
      setIsPdf(file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));

      const upload = await uploadItcDrawingFile({ projectId, file });

      if (upload.localDataUrl && !previewUrl) {
        setPreviewUrl(upload.localDataUrl);
      }

      if (upload.url) {
        const saved = await uploadProjectDrawing({
          projectId,
          fileName: file.name,
          fileUrl: upload.url,
          fileType: file.type || "image/png",
          uploadedBy,
        });

        if (saved.error || !saved.drawing) {
          const localDrawing = buildLocalDrawingRecord({
            projectId,
            fileName: file.name,
            fileType: file.type,
            previewUrl: localPreview,
            uploadedBy,
          });
          setDrawing(localDrawing);
          onDrawingUploaded(localDrawing);
          setMessage(
            saved.error
              ? `Using local preview (${saved.error}). Pin dropping is still available.`
              : "Using local preview. Pin dropping is still available."
          );
          return;
        }

        setDrawing(saved.drawing);
        onDrawingUploaded(saved.drawing);
        return;
      }

      const localDrawing = buildLocalDrawingRecord({
        projectId,
        fileName: file.name,
        fileType: file.type,
        previewUrl: upload.localDataUrl ?? localPreview,
        uploadedBy,
      });
      setDrawing(localDrawing);
      onDrawingUploaded(localDrawing);
      setMessage(
        upload.usedLocalFallback
          ? "Storage bucket unavailable — using local preview. Pin dropping continues normally."
          : upload.error
            ? `Using local preview (${upload.error}). Pin dropping continues normally.`
            : "Using local preview. Pin dropping continues normally."
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Drawing upload failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!previewUrl || !drawing || !containerRef.current) return;

    const coords = getRelativeCanvasCoordinates(
      event.clientX,
      event.clientY,
      containerRef.current
    );
    setPendingCoords({
      x: sanitizeRelativeCoordinate(coords.x),
      y: sanitizeRelativeCoordinate(coords.y),
    });
  };

  const handlePinSave = async (input: {
    serviceType: string;
    upstreamPitNumber: string;
    downstreamPitNumber: string;
  }) => {
    if (!drawing || !pendingCoords) return;

    setLoading(true);
    setMessage(null);

    try {
      const result = await saveDrawingPin({
        drawingId: drawing.id,
        projectId,
        mapX: sanitizeRelativeCoordinate(pendingCoords.x),
        mapY: sanitizeRelativeCoordinate(pendingCoords.y),
        serviceType: input.serviceType,
        upstreamPitNumber: input.upstreamPitNumber,
        downstreamPitNumber: input.downstreamPitNumber,
      });

      if (result.error || !result.pin) {
        setMessage(result.error ?? "Failed to save pin");
        return;
      }

      onPinAdded(result.pin);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save pin");
    } finally {
      setLoading(false);
      setPendingCoords(null);
    }
  };

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h3 className="font-semibold text-slate-900">Upload Drawing & Drop Pins</h3>
          <p className="text-xs text-slate-500">
            Upload a plan image or PDF, then click the drawing to drop service pins.
          </p>
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleUpload(file);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload Drawing
          </button>
        </div>
      </div>

      <div className="p-4">
        {!previewUrl ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
            Upload a plan drawing to begin pin dropping.
          </div>
        ) : (
          <div
            ref={containerRef}
            onClick={handleCanvasClick}
            className="relative cursor-crosshair overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
          >
            {isPdf ? (
              <iframe
                title="Plan drawing"
                src={previewUrl}
                className="pointer-events-none h-[480px] w-full bg-white"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Plan drawing" className="block w-full select-none" draggable={false} />
            )}

            {pins.map((pin) => (
              <span
                key={pin.id}
                title={`${pin.service_type}: ${pin.upstream_pit_number} → ${pin.downstream_pit_number}`}
                className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md"
                style={{
                  left: `${sanitizeRelativeCoordinate(pin.map_x) * 100}%`,
                  top: `${sanitizeRelativeCoordinate(pin.map_y) * 100}%`,
                  backgroundColor: ITC_SERVICE_TYPE_COLORS[pin.service_type] ?? "#64748b",
                }}
              />
            ))}
          </div>
        )}

        {message ? (
          <p
            className={`mt-3 text-sm ${
              message.toLowerCase().includes("local preview")
                ? "text-amber-700"
                : "text-red-600"
            }`}
          >
            {message}
          </p>
        ) : null}
      </div>

      {pendingCoords ? (
        <ItcPinQuickModal
          onClose={() => setPendingCoords(null)}
          onSave={(input) => void handlePinSave(input)}
        />
      ) : null}
    </div>
  );
}
