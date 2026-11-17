"use client";

import { useCallback, useEffect, useRef } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Eraser } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SignaturePadProps {
  label?: string;
  value?: string | null;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  /** Fires with a PNG data URL when a stroke ends, or null when cleared. */
  onChange?: (dataUrl: string | null) => void;
  /** Alias for onChange — called after each stroke completes. */
  onEnd?: (dataUrl: string | null) => void;
}

export default function SignaturePad({
  label,
  value = null,
  required = false,
  disabled = false,
  className,
  onChange,
  onEnd,
}: SignaturePadProps) {
  const canvasRef = useRef<SignatureCanvas | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const valueRef = useRef(value);

  const emit = useCallback(
    (dataUrl: string | null) => {
      onChange?.(dataUrl);
      onEnd?.(dataUrl);
    },
    [onChange, onEnd]
  );

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dataUrl = canvas.isEmpty() ? null : canvas.toDataURL("image/png");
    const width = Math.max(container.clientWidth, 1);
    const height = 150;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const canvasEl = canvas.getCanvas();

    canvasEl.width = width * ratio;
    canvasEl.height = height * ratio;
    canvasEl.style.width = `${width}px`;
    canvasEl.style.height = `${height}px`;

    const ctx = canvasEl.getContext("2d");
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(ratio, ratio);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 2.25;
    }

    const restore = dataUrl || valueRef.current;
    if (restore) {
      canvas.fromDataURL(restore, {
        width,
        height,
        ratio: 1,
      });
    }
  }, []);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    resizeCanvas();
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => resizeCanvas());
    observer.observe(container);
    return () => observer.disconnect();
  }, [resizeCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!value) {
      if (!canvas.isEmpty()) canvas.clear();
      return;
    }
    if (canvas.isEmpty()) {
      canvas.fromDataURL(value);
    }
  }, [value]);

  const handleEnd = () => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.isEmpty()) {
      emit(null);
      return;
    }
    emit(canvas.toDataURL("image/png"));
  };

  const handleClear = () => {
    canvasRef.current?.clear();
    emit(null);
  };

  return (
    <div className={cn("space-y-2", className)}>
      {label ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-600">
            {label}
            {required ? " *" : ""}
          </p>
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            <Eraser className="h-3.5 w-3.5" />
            Clear
          </button>
        </div>
      ) : (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            <Eraser className="h-3.5 w-3.5" />
            Clear
          </button>
        </div>
      )}

      <div
        ref={containerRef}
        className={cn(
          "overflow-hidden rounded-xl border border-slate-300 bg-white touch-none",
          disabled && "pointer-events-none opacity-60"
        )}
      >
        <SignatureCanvas
          ref={canvasRef}
          penColor="#1e293b"
          minWidth={1.5}
          maxWidth={2.75}
          throttle={16}
          clearOnResize={false}
          onEnd={handleEnd}
          canvasProps={{
            className: "block h-[150px] w-full touch-none",
            style: { width: "100%", height: "150px", touchAction: "none" },
          }}
        />
      </div>
      <p className="text-[11px] text-slate-400">
        Sign with your finger or stylus. Use Clear to redraw.
      </p>
    </div>
  );
}
