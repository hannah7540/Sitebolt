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

function getDevicePixelRatio(): number {
  return typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
}

function IsolatedSignaturePad({
  defaultValue = null,
  onCommit,
}: IsolatedSignaturePadProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const onCommitRef = useRef(onCommit);
  const committedDataUrlRef = useRef<string | null>(null);
  const restoringRef = useRef(false);
  const lastLayoutWidthRef = useRef(0);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  const applyStrokeStyle = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const restoreFromDataUrl = useCallback(
    (dataUrl: string) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      restoringRef.current = true;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        restoringRef.current = false;
        return;
      }

      const img = new Image();
      img.onload = () => {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
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

  const resizeCanvas = useCallback(
    (displayWidth: number, preserveContent = true) => {
      const canvas = canvasRef.current;
      if (!canvas) return false;

      const width = Math.max(displayWidth, MIN_DISPLAY_WIDTH_PX);
      const height = DISPLAY_HEIGHT_PX;
      const dpr = getDevicePixelRatio();
      const previousDataUrl = preserveContent ? committedDataUrlRef.current : null;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return false;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      applyStrokeStyle(ctx);

      if (previousDataUrl) {
        restoreFromDataUrl(previousDataUrl);
      }

      return true;
    },
    [applyStrokeStyle, restoreFromDataUrl]
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const tryInitialResize = () => {
      const width = container.clientWidth;
      if (width <= 0) return;
      lastLayoutWidthRef.current = Math.floor(width);
      resizeCanvas(width, false);
      if (defaultValue) {
        restoreFromDataUrl(defaultValue);
        committedDataUrlRef.current = defaultValue;
      }
    };

    tryInitialResize();

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? container.clientWidth;
      if (width <= 0) return;

      const rounded = Math.floor(width);
      if (rounded === lastLayoutWidthRef.current) return;
      lastLayoutWidthRef.current = rounded;
      resizeCanvas(width, true);
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [defaultValue, resizeCanvas, restoreFromDataUrl]);

  const getCanvasPoint = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;

      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      return {
        x: (clientX - rect.left) * (canvas.width / rect.width),
        y: (clientY - rect.top) * (canvas.height / rect.height),
      };
    },
    []
  );

  const getPointFromEvent = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if ("touches" in event.nativeEvent) {
        const touch =
          event.nativeEvent.touches[0] ?? event.nativeEvent.changedTouches[0];
        if (!touch) return null;
        return getCanvasPoint(touch.clientX, touch.clientY);
      }

      return getCanvasPoint(event.nativeEvent.clientX, event.nativeEvent.clientY);
    },
    [getCanvasPoint]
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
      const point = getPointFromEvent(event);
      if (!ctx || !point) return;

      drawingRef.current = true;
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
    },
    [getPointFromEvent]
  );

  const handlePointerMove = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current || restoringRef.current) return;
      event.preventDefault();

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const point = getPointFromEvent(event);
      if (!ctx || !point) return;

      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    },
    [getPointFromEvent]
  );

  const handlePointerEnd = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      if (!drawingRef.current) return;
      drawingRef.current = false;
      commitStroke();
    },
    [commitStroke]
  );

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

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const blockTouchScroll = (event: TouchEvent) => {
      event.preventDefault();
    };

    const options: AddEventListenerOptions = { passive: false };
    container.addEventListener("touchstart", blockTouchScroll, options);
    container.addEventListener("touchmove", blockTouchScroll, options);
    container.addEventListener("touchend", blockTouchScroll, options);
    canvas.addEventListener("touchstart", blockTouchScroll, options);
    canvas.addEventListener("touchmove", blockTouchScroll, options);
    canvas.addEventListener("touchend", blockTouchScroll, options);

    return () => {
      container.removeEventListener("touchstart", blockTouchScroll);
      container.removeEventListener("touchmove", blockTouchScroll);
      container.removeEventListener("touchend", blockTouchScroll);
      canvas.removeEventListener("touchstart", blockTouchScroll);
      canvas.removeEventListener("touchmove", blockTouchScroll);
      canvas.removeEventListener("touchend", blockTouchScroll);
    };
  }, []);

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="relative touch-none overflow-hidden rounded-lg border border-slate-300 bg-white"
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
        className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-slate-500 hover:text-slate-900 active:scale-95"
      >
        <Eraser className="h-4 w-4" /> Clear signature
      </button>
    </div>
  );
}

export default memo(IsolatedSignaturePad);
