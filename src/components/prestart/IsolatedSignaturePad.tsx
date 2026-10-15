"use client";

import { Eraser } from "lucide-react";
import { memo, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface IsolatedSignaturePadProps {
  /** Initial image restored once when the pad mounts. Not synced on later parent re-renders. */
  defaultValue?: string | null;
  /** Called once per completed stroke, or when the pad is cleared. */
  onCommit: (dataUrl: string | null) => void;
  /** Extra classes for the pad container (e.g. taller guest-portal canvas). */
  className?: string;
}

const DEFAULT_DISPLAY_HEIGHT_PX = 160;
const MIN_DISPLAY_WIDTH_PX = 280;
const MIN_DISPLAY_HEIGHT_PX = 80;
const RESIZE_IGNORE_PX = 2;

function getDevicePixelRatio(): number {
  return typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
}

function copyCanvasPixels(source: HTMLCanvasElement): HTMLCanvasElement | null {
  if (source.width <= 0 || source.height <= 0) return null;
  const copy = document.createElement("canvas");
  copy.width = source.width;
  copy.height = source.height;
  const ctx = copy.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0);
  return copy;
}

function IsolatedSignaturePad({
  defaultValue = null,
  onCommit,
  className,
}: IsolatedSignaturePadProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const onCommitRef = useRef(onCommit);
  const committedDataUrlRef = useRef<string | null>(defaultValue);
  const restoringRef = useRef(false);
  const lastLayoutWidthRef = useRef(0);
  const lastLayoutHeightRef = useRef(0);
  const pendingResizeRef = useRef<{ width: number; height: number } | null>(
    null
  );
  const initialValueRef = useRef(defaultValue);
  const didInitRef = useRef(false);
  const restoreGenRef = useRef(0);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  const applyStrokeStyle = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const snapshotCanvas = useCallback((): string | null => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
      return committedDataUrlRef.current;
    }
    try {
      return canvas.toDataURL("image/png");
    } catch {
      return committedDataUrlRef.current;
    }
  }, []);

  const restoreFromDataUrl = useCallback(
    (dataUrl: string) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      restoringRef.current = true;
      const restoreGen = ++restoreGenRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        restoringRef.current = false;
        return;
      }

      const img = new Image();
      const paint = () => {
        if (restoreGen !== restoreGenRef.current || canvasRef.current !== canvas) {
          return;
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        applyStrokeStyle(ctx);
        restoringRef.current = false;
      };
      img.onload = paint;
      img.onerror = () => {
        if (restoreGen === restoreGenRef.current) {
          restoringRef.current = false;
        }
      };
      img.src = dataUrl;
      if (img.complete && img.naturalWidth > 0) {
        paint();
      }
    },
    [applyStrokeStyle]
  );

  const resizeCanvas = useCallback(
    (displayWidth: number, displayHeight: number, preserveContent = true) => {
      const canvas = canvasRef.current;
      if (!canvas || drawingRef.current) return false;

      const width = Math.max(displayWidth, MIN_DISPLAY_WIDTH_PX);
      const height = Math.max(displayHeight, MIN_DISPLAY_HEIGHT_PX);
      const dpr = getDevicePixelRatio();
      const nextWidth = Math.floor(width * dpr);
      const nextHeight = Math.floor(height * dpr);

      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      if (canvas.width === nextWidth && canvas.height === nextHeight) {
        return true;
      }

      const previousDataUrl = preserveContent ? snapshotCanvas() : null;
      if (previousDataUrl) {
        committedDataUrlRef.current = previousDataUrl;
      }
      const pixelCopy = preserveContent ? copyCanvasPixels(canvas) : null;

      canvas.width = nextWidth;
      canvas.height = nextHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) return false;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (pixelCopy) {
        ctx.drawImage(pixelCopy, 0, 0, nextWidth, nextHeight);
        applyStrokeStyle(ctx);
      } else if (previousDataUrl) {
        applyStrokeStyle(ctx);
        restoreFromDataUrl(previousDataUrl);
      } else {
        applyStrokeStyle(ctx);
      }

      return true;
    },
    [applyStrokeStyle, restoreFromDataUrl, snapshotCanvas]
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const applySize = (
      width: number,
      height: number,
      preserveContent: boolean
    ) => {
      if (width <= 0) return;
      const nextHeight =
        height > 0 ? height : DEFAULT_DISPLAY_HEIGHT_PX;
      const roundedWidth = Math.floor(width);
      const roundedHeight = Math.floor(nextHeight);
      if (
        preserveContent &&
        Math.abs(roundedWidth - lastLayoutWidthRef.current) < RESIZE_IGNORE_PX &&
        Math.abs(roundedHeight - lastLayoutHeightRef.current) < RESIZE_IGNORE_PX
      ) {
        return;
      }
      lastLayoutWidthRef.current = roundedWidth;
      lastLayoutHeightRef.current = roundedHeight;
      resizeCanvas(width, nextHeight, preserveContent);
    };

    if (!didInitRef.current) {
      didInitRef.current = true;
      applySize(
        container.clientWidth,
        container.clientHeight || DEFAULT_DISPLAY_HEIGHT_PX,
        false
      );
      const initial = initialValueRef.current;
      if (initial) {
        committedDataUrlRef.current = initial;
        restoreFromDataUrl(initial);
      }
    }

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? container.clientWidth;
      const height =
        entries[0]?.contentRect.height ||
        container.clientHeight ||
        DEFAULT_DISPLAY_HEIGHT_PX;
      if (drawingRef.current || restoringRef.current) {
        pendingResizeRef.current = { width, height };
        return;
      }

      applySize(width, height, true);
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [resizeCanvas, restoreFromDataUrl]);

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

  const flushPendingResize = useCallback(() => {
    const pending = pendingResizeRef.current;
    pendingResizeRef.current = null;
    if (pending == null) return;
    const roundedWidth = Math.floor(pending.width);
    const roundedHeight = Math.floor(pending.height);
    if (
      Math.abs(roundedWidth - lastLayoutWidthRef.current) < RESIZE_IGNORE_PX &&
      Math.abs(roundedHeight - lastLayoutHeightRef.current) < RESIZE_IGNORE_PX
    ) {
      return;
    }
    lastLayoutWidthRef.current = roundedWidth;
    lastLayoutHeightRef.current = roundedHeight;
    resizeCanvas(pending.width, pending.height, true);
  }, [resizeCanvas]);

  const handlePointerStart = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (restoringRef.current) return;
      event.preventDefault();
      event.stopPropagation();

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const point = getPointFromEvent(event);
      if (!ctx || !point) return;

      drawingRef.current = true;
      restoreGenRef.current += 1;
      restoringRef.current = false;
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
    },
    [getPointFromEvent]
  );

  const handlePointerMove = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current || restoringRef.current) return;
      event.preventDefault();
      event.stopPropagation();

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
      event.stopPropagation();
      if (!drawingRef.current) return;
      drawingRef.current = false;
      commitStroke();
      flushPendingResize();
    },
    [commitStroke, flushPendingResize]
  );

  const handleClear = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      applyStrokeStyle(ctx);
      committedDataUrlRef.current = null;
      onCommitRef.current(null);
    },
    [applyStrokeStyle]
  );

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
    <div className="w-full space-y-2">
      <div
        ref={containerRef}
        className={cn(
          "relative min-h-[160px] touch-none overflow-hidden rounded-lg border border-slate-300 bg-white",
          className
        )}
        style={{ touchAction: "none" }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <canvas
          ref={canvasRef}
          className="block h-full w-full touch-none"
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
