"use client";

import { Eraser } from "lucide-react";
import { memo, useCallback, useEffect, useLayoutEffect, useRef } from "react";

export interface IsolatedSignaturePadProps {
  /** Initial image restored once when the pad mounts. Not synced on later parent re-renders. */
  defaultValue?: string | null;
  /** Called once per completed stroke, or when the pad is cleared. */
  onCommit: (dataUrl: string | null) => void;
}

const DISPLAY_HEIGHT_PX = 160;
const MIN_DISPLAY_WIDTH_PX = 280;

function IsolatedSignaturePad({
  defaultValue = null,
  onCommit,
}: IsolatedSignaturePadProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const onCommitRef = useRef(onCommit);
  const committedDataUrlRef = useRef<string | null>(null);
  const sizeInitializedRef = useRef(false);
  const restoringRef = useRef(false);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  const applyStrokeStyle = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const initializeCanvasSize = useCallback(
    (displayWidth: number) => {
      const canvas = canvasRef.current;
      if (!canvas || sizeInitializedRef.current) return;

      const width = Math.max(displayWidth, MIN_DISPLAY_WIDTH_PX);
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(DISPLAY_HEIGHT_PX * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${DISPLAY_HEIGHT_PX}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      applyStrokeStyle(ctx);
      sizeInitializedRef.current = true;
    },
    [applyStrokeStyle]
  );

  const restoreFromDataUrl = useCallback(
    (dataUrl: string) => {
      const canvas = canvasRef.current;
      if (!canvas || !sizeInitializedRef.current) return;

      restoringRef.current = true;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        restoringRef.current = false;
        return;
      }

      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        applyStrokeStyle(ctx);
        restoringRef.current = false;
      };
      img.onerror = () => {
        restoringRef.current = false;
      };
      img.src = dataUrl;
    },
    [applyStrokeStyle]
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const initialize = () => {
      if (sizeInitializedRef.current) return;
      const width = container.clientWidth;
      if (width <= 0) return;

      initializeCanvasSize(width);

      if (defaultValue) {
        restoreFromDataUrl(defaultValue);
        committedDataUrlRef.current = defaultValue;
      }
    };

    initialize();

    const observer = new ResizeObserver((entries) => {
      if (sizeInitializedRef.current) return;
      const width = entries[0]?.contentRect.width ?? 0;
      if (width > 0) {
        initializeCanvasSize(width);
        if (defaultValue) {
          restoreFromDataUrl(defaultValue);
          committedDataUrlRef.current = defaultValue;
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [defaultValue, initializeCanvasSize, restoreFromDataUrl]);

  const getCanvasPoint = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      if ("touches" in event.nativeEvent) {
        const touch =
          event.nativeEvent.touches[0] ?? event.nativeEvent.changedTouches[0];
        if (!touch) return null;
        return {
          x: (touch.clientX - rect.left) * scaleX,
          y: (touch.clientY - rect.top) * scaleY,
        };
      }

      return {
        x: (event.nativeEvent.clientX - rect.left) * scaleX,
        y: (event.nativeEvent.clientY - rect.top) * scaleY,
      };
    },
    []
  );

  const commitStroke = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || restoringRef.current) return;

    const dataUrl = canvas.toDataURL("image/png");
    committedDataUrlRef.current = dataUrl;
    onCommitRef.current(dataUrl);
  }, []);

  const handlePointerStart = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (restoringRef.current) return;
      event.preventDefault();

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const point = getCanvasPoint(event);
      if (!ctx || !point) return;

      drawingRef.current = true;
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
    },
    [getCanvasPoint]
  );

  const handlePointerMove = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current || restoringRef.current) return;
      event.preventDefault();

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const point = getCanvasPoint(event);
      if (!ctx || !point) return;

      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    },
    [getCanvasPoint]
  );

  const handlePointerEnd = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    commitStroke();
  }, [commitStroke]);

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    applyStrokeStyle(ctx);
    committedDataUrlRef.current = null;
    onCommitRef.current(null);
  }, [applyStrokeStyle]);

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-lg border border-slate-300 bg-white"
        style={{ touchAction: "none" }}
      >
        <canvas
          ref={canvasRef}
          className="block w-full touch-none"
          style={{ touchAction: "none" }}
          onMouseDown={handlePointerStart}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerEnd}
          onMouseLeave={handlePointerEnd}
          onTouchStart={handlePointerStart}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerEnd}
          onTouchCancel={handlePointerEnd}
        />
      </div>
      <button
        type="button"
        onClick={handleClear}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900"
      >
        <Eraser className="h-4 w-4" /> Clear signature
      </button>
    </div>
  );
}

export default memo(IsolatedSignaturePad);
