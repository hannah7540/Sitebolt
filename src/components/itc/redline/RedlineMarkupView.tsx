"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import "./redline-markup.css";
import {
  deleteRedline,
  listRedlines,
  saveRedline,
  uploadRedlineSource,
  type RedlineItcOption,
  type RedlineMe,
  type RedlineRun,
  type RedlineSourceRecord,
} from "@/lib/api/redline";
import {
  clamp,
  defaultLabel,
  labelBox,
  leaderOf,
  rdp,
  type RedlineLabel,
  type RedlinePoint,
  type RedlineSeg,
} from "@/lib/redline-geometry";

type Mode = "tap" | "free" | "move" | "label";

interface PdfPage {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
    canvas: HTMLCanvasElement;
  }) => { promise: Promise<void> };
}

interface PdfDoc {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
}

interface WorkState {
  segs: RedlineSeg[];
  kinds: string[];
  page: number;
  editing: string | null;
}

const RED = "#e11d2e";
const BLUE = "#2563eb";
const DEF_WF = 0.004;
const DEF_OP = 0.4;
const DEF_LS = 0.014;

const HINTS: Record<Mode, string> = {
  tap: "Tap along the run to place points. Drag with one finger to pan, pinch to zoom. Use Next segment for a branch. Width slider sets the highlight thickness.",
  free: "Draw the run with one finger. Use two fingers to move and zoom. Lines are straightened automatically.",
  move: "Drag a point to move it. Drag empty space to pan.",
  label: "Drag the ITC label to reposition it. The thin leader line follows to the nearest point on the run. Label size slider changes its size.",
};

function esc(value: string): string {
  return String(value).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c
  );
}

function emptyWork(page = 1): WorkState {
  return { segs: [[]], kinds: ["tap"], page, editing: null };
}

function hasPts(work: WorkState): boolean {
  return work.segs.some((seg) => seg.length > 0);
}

function nPts(work: WorkState): number {
  return work.segs.reduce((sum, seg) => sum + seg.length, 0);
}

function pts2str(seg: RedlineSeg, height: number): string {
  return seg.map((p) => `${(p[0] * 1000).toFixed(1)},${(p[1] * height).toFixed(1)}`).join(" ");
}

function segSvg(segs: RedlineSeg[], col: string, width: number, height: number, opacity: number): string {
  const sw = width * 1000;
  let out = `<g opacity="${opacity}" stroke="${col}" fill="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">`;
  for (const seg of segs) {
    if (seg.length >= 2) out += `<polyline fill="none" points="${pts2str(seg, height)}"/>`;
    else if (seg.length === 1) {
      out += `<circle stroke="none" cx="${seg[0][0] * 1000}" cy="${seg[0][1] * height}" r="${sw / 2}"/>`;
    }
  }
  return `${out}</g>`;
}

function labelSvg(
  run: RedlineRun,
  id: string,
  col: string,
  height: number,
  boxed: boolean,
  ratio: number
): string {
  const label = run.label || defaultLabel(run.segs, DEF_LS, ratio);
  const leader = leaderOf(run.segs, label, id, ratio);
  const fs = label.size * 1000;
  let out = "";
  if (leader) {
    out += `<line x1="${leader.q[0] * 1000}" y1="${leader.q[1] * height}" x2="${leader.e[0] * 1000}" y2="${leader.e[1] * height}" stroke="${col}" stroke-width="1.3" vector-effect="non-scaling-stroke"/>`;
  }
  out += `<text x="${label.x * 1000}" y="${label.y * height}" font-size="${fs}" font-weight="700" font-family="sans-serif" fill="${col}" stroke="#fff" stroke-width="${fs * 0.22}" paint-order="stroke" stroke-linejoin="round">${esc(id)}</text>`;
  if (boxed) {
    const box = labelBox(label, id, ratio);
    out += `<rect x="${box.l * 1000}" y="${box.t * height}" width="${(box.r - box.l) * 1000}" height="${(box.b - box.t) * height}" fill="none" stroke="${col}" stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>`;
  }
  return out;
}

function downloadBlob(name: string, blob: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function readPref(key: string, fallback: number): number {
  try {
    const value = parseFloat(localStorage.getItem(key) ?? "");
    return value > 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

export interface RedlineMarkupViewProps {
  me: RedlineMe;
  itcs: RedlineItcOption[];
  backHref: string;
  initialItcId?: string | null;
}

export default function RedlineMarkupView({
  me,
  itcs,
  backHref,
  initialItcId = null,
}: RedlineMarkupViewProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<number | null>(null);
  const persistTimer = useRef<number | null>(null);

  const pdfRef = useRef<PdfDoc | null>(null);
  const sourceRef = useRef<RedlineSourceRecord | null>(null);
  const savedRef = useRef<Record<string, RedlineRun>>({});
  const workRef = useRef<WorkState>(emptyWork());
  const currentRef = useRef(initialItcId || itcs[0]?.id || "");
  const modeRef = useRef<Mode>("tap");
  const pageNoRef = useRef(1);
  const ratioRef = useRef(1);
  const pageSizeRef = useRef({ w: 0, h: 0 });
  const viewRef = useRef({ z: 1, px: 0, py: 0 });
  const prefsRef = useRef({
    wf: readPref("redline:width", DEF_WF),
    op: readPref("redline:opacity", DEF_OP),
    lf: readPref("redline:lsize", DEF_LS),
  });
  const othersRef = useRef(true);
  const ptrsRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<{
    ds: {
      x: number;
      y: number;
      t: number;
      moved: boolean;
      px: number;
      py: number;
      needEdit?: boolean;
    } | null;
    pinch: {
      d: number;
      cx: number;
      cy: number;
      base: { z: number; px: number; py: number };
    } | null;
    stroke: { si: number; raw: RedlinePoint[] } | null;
    dragV: [number, number] | null;
    dragLab: { dx: number; dy: number } | null;
  }>({ ds: null, pinch: null, stroke: null, dragV: null, dragLab: null });

  const [currentId, setCurrentId] = useState(currentRef.current);
  const [mode, setMode] = useState<Mode>("tap");
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pageLabel, setPageLabel] = useState("1 / 1");
  const [multiPage, setMultiPage] = useState(false);
  const [runCount, setRunCount] = useState(0);
  const [chip, setChip] = useState({ className: "chip", text: "Not marked" });
  const [hint, setHint] = useState(HINTS.tap);
  const [needEdit, setNeedEdit] = useState(false);
  const [actions, setActions] = useState({
    undo: true,
    next: true,
    clear: true,
    edit: true,
    save: true,
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [modalHtml, setModalHtml] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadLabel, setUploadLabel] = useState("Uploading drawing…");
  const [slider, setSlider] = useState({ width: "8 px", opacity: "40%", label: "14 px" });

  const itcById = useMemo(() => {
    const map = new Map<string, RedlineItcOption>();
    for (const itc of itcs) map.set(itc.id, itc);
    return map;
  }, [itcs]);

  const labelFor = useCallback(
    (itcId: string) => itcById.get(itcId)?.number ?? itcId,
    [itcById]
  );

  const toast = useCallback((message: string) => {
    const el = toastRef.current;
    if (!el) return;
    el.textContent = message;
    el.style.display = "block";
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => {
      el.style.display = "none";
    }, 2600);
  }, []);

  const persistPrefs = useCallback(() => {
    try {
      localStorage.setItem("redline:width", String(prefsRef.current.wf));
      localStorage.setItem("redline:opacity", String(prefsRef.current.op));
      localStorage.setItem("redline:lsize", String(prefsRef.current.lf));
    } catch {
      // private mode
    }
  }, []);

  const applyTransform = useCallback(() => {
    const world = worldRef.current;
    if (!world) return;
    const { z, px, py } = viewRef.current;
    world.style.transform = `translate(${px}px, ${py}px) scale(${z})`;
  }, []);

  const clampPan = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const { z } = viewRef.current;
    const w = pageSizeRef.current.w * z;
    const h = pageSizeRef.current.h * z;
    const m = 60;
    viewRef.current.px = Math.min(stage.clientWidth - m, Math.max(m - w, viewRef.current.px));
    viewRef.current.py = Math.min(stage.clientHeight - m, Math.max(m - h, viewRef.current.py));
  }, []);

  const layoutPage = useCallback(() => {
    const stage = stageRef.current;
    const page = pageRef.current;
    const overlay = overlayRef.current;
    if (!stage || !page || !overlay) return;
    const ratio = ratioRef.current;
    const pageW = Math.min(stage.clientWidth, stage.clientHeight * ratio);
    const pageH = pageW / ratio;
    pageSizeRef.current = { w: pageW, h: pageH };
    page.style.width = `${pageW}px`;
    page.style.height = `${pageH}px`;
    overlay.setAttribute("viewBox", `0 0 1000 ${1000 / ratio}`);
  }, []);

  const fitView = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    viewRef.current.z = 1;
    viewRef.current.px = (stage.clientWidth - pageSizeRef.current.w) / 2;
    viewRef.current.py = (stage.clientHeight - pageSizeRef.current.h) / 2;
    applyTransform();
  }, [applyTransform]);

  const setZoom = useCallback(
    (
      nextZoom: number,
      fx: number,
      fy: number,
      tx: number,
      ty: number,
      base?: { z: number; px: number; py: number }
    ) => {
      const stage = stageRef.current;
      if (!stage) return;
      const nz = Math.max(1, Math.min(10, nextZoom));
      const sr = stage.getBoundingClientRect();
      const b = base ?? { ...viewRef.current };
      const wx = (fx - sr.left - b.px) / b.z;
      const wy = (fy - sr.top - b.py) / b.z;
      viewRef.current.z = nz;
      viewRef.current.px = tx - sr.left - wx * nz;
      viewRef.current.py = ty - sr.top - wy * nz;
      clampPan();
      applyTransform();
    },
    [applyTransform, clampPan]
  );

  const toPage = useCallback((cx: number, cy: number): RedlinePoint => {
    const page = pageRef.current;
    if (!page) return [0, 0];
    const r = page.getBoundingClientRect();
    return [
      clamp((cx - r.left) / r.width, 0, 1),
      clamp((cy - r.top) / r.height, 0, 1),
    ];
  }, []);

  const curTarget = useCallback((): RedlineRun | null => {
    if (hasPts(workRef.current)) return null;
    return savedRef.current[currentRef.current] ?? null;
  }, []);

  const draw = useCallback(() => {
    const overlay = overlayRef.current;
    const page = pageRef.current;
    if (!overlay) return;
    if (!pdfRef.current) {
      overlay.innerHTML = "";
      return;
    }
    const ratio = ratioRef.current;
    const height = 1000 / ratio;
    const rw = page?.getBoundingClientRect().width || pageSizeRef.current.w;
    const u = 1000 / (rw || 1);
    const current = currentRef.current;
    const work = workRef.current;
    const pageNo = pageNoRef.current;
    let html = "";

    if (othersRef.current) {
      for (const itc of itcs) {
        const run = savedRef.current[itc.id];
        if (!run || itc.id === current || run.page !== pageNo) continue;
        html +=
          segSvg(run.segs, BLUE, run.width || DEF_WF, height, run.opacity || DEF_OP) +
          labelSvg(run, itc.number, BLUE, height, false, ratio);
      }
    }

    const mine = savedRef.current[current];
    if (mine && mine.page === pageNo && work.editing !== current && !hasPts(work)) {
      html +=
        segSvg(mine.segs, RED, mine.width || DEF_WF, height, mine.opacity || DEF_OP) +
        labelSvg(mine, labelFor(current), RED, height, modeRef.current === "label", ratio);
    }

    if (work.page === pageNo || !hasPts(work)) {
      html += segSvg(work.segs, RED, prefsRef.current.wf, height, prefsRef.current.op);
      work.segs.forEach((seg, si) => {
        if (!seg.length) return;
        const pts =
          modeRef.current === "move"
            ? seg
            : work.kinds[si] === "tap" && !work.segs[si + 1]
              ? [seg[seg.length - 1]]
              : [];
        pts.forEach((p) => {
          html += `<circle class="vdot" cx="${p[0] * 1000}" cy="${p[1] * height}" r="${2.5 * u}"/>`;
        });
      });
    }

    overlay.innerHTML = html;

    const target = curTarget();
    const width = target ? target.width || DEF_WF : prefsRef.current.wf;
    const opacity = target ? target.opacity || DEF_OP : prefsRef.current.op;
    const labelSize = target ? (target.label || defaultLabel(target.segs, DEF_LS, ratio)).size : prefsRef.current.lf;
    setSlider({
      width: `${Math.round(width * rw * 10) / 10} px`,
      opacity: `${Math.round(opacity * 100)}%`,
      label: `${Math.round(labelSize * rw)} px`,
    });
    const wd = document.getElementById("wd") as HTMLInputElement | null;
    const op = document.getElementById("op") as HTMLInputElement | null;
    const ls = document.getElementById("ls") as HTMLInputElement | null;
    if (wd && document.activeElement !== wd) wd.value = String(clamp(width * rw, 1, 40));
    if (op && document.activeElement !== op) op.value = String(clamp(opacity * 100, 10, 100));
    if (ls && document.activeElement !== ls) ls.value = String(clamp(labelSize * rw, 6, 80));
  }, [curTarget, itcs, labelFor]);

  const refresh = useCallback(() => {
    const current = currentRef.current;
    const work = workRef.current;
    const saved = Boolean(savedRef.current[current]);
    const drawing = hasPts(work);
    if (drawing) setChip({ className: "chip work", text: `Drawing... ${nPts(work)} pts` });
    else if (saved) setChip({ className: "chip ok", text: "Marked - field markup, office to review" });
    else setChip({ className: "chip", text: "Not marked" });

    const editHint = modeRef.current === "move" && saved && !drawing;
    setNeedEdit(editHint);
    setHint(
      editHint
        ? "This run is saved. Press Edit saved run (orange), then drag its points and press Save run."
        : HINTS[modeRef.current]
    );
    setRunCount(Object.keys(savedRef.current).length);
    setActions({
      undo: !drawing,
      next: !drawing || work.segs[work.segs.length - 1].length === 0,
      clear: !drawing,
      edit: !saved || drawing,
      save: !drawing,
    });
    setCurrentId(current);
    setMode(modeRef.current);
    applyTransform();
    draw();
  }, [applyTransform, draw]);

  const persistRun = useCallback(
    async (run: RedlineRun) => {
      if (!sourceRef.current) return;
      if (persistTimer.current) window.clearTimeout(persistTimer.current);
      persistTimer.current = window.setTimeout(async () => {
        const result = await saveRedline({
          id: run.id,
          itc_id: run.itc_id,
          source_id: run.source_id,
          segs: run.segs,
          page: run.page,
          width: run.width,
          opacity: run.opacity,
          label: run.label,
          source: run.source,
          review: run.review,
          drawn_by_name: me.name,
          drawn_by_worker_id: me.workerId,
        });
        if (result.error) {
          toast(result.error);
          return;
        }
        if (result.run) savedRef.current[result.run.itc_id] = result.run;
      }, 280);
    },
    [me.name, me.workerId, toast]
  );

  const renderPageTo = useCallback(async (canvas: HTMLCanvasElement, n: number) => {
    const pdf = pdfRef.current;
    if (!pdf) return 1;
    const page = await pdf.getPage(n);
    const v1 = page.getViewport({ scale: 1 });
    let scale = Math.min(4096 / Math.max(v1.width, v1.height), Math.sqrt(12e6 / (v1.width * v1.height)));
    scale = Math.min(scale, 4);
    const viewport = page.getViewport({ scale });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return v1.width / v1.height;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    return v1.width / v1.height;
  }, []);

  const gotoPage = useCallback(
    async (n: number) => {
      const canvas = canvasRef.current;
      const pdf = pdfRef.current;
      if (!canvas || !pdf) return;
      pageNoRef.current = n;
      ratioRef.current = await renderPageTo(canvas, n);
      setMultiPage(pdf.numPages > 1);
      setPageLabel(`${n} / ${pdf.numPages}`);
      layoutPage();
      fitView();
    },
    [fitView, layoutPage, renderPageTo]
  );

  const loadRuns = useCallback(
    async (sourceId: string) => {
      const rows = await listRedlines(sourceId);
      const next: Record<string, RedlineRun> = {};
      for (const row of rows) next[row.itc_id] = row;
      savedRef.current = next;
      setRunCount(Object.keys(next).length);
    },
    []
  );

  const openFile = useCallback(
    async (file: File) => {
      setUploading(true);
      setUploadPercent(0);
      setUploadLabel("Uploading drawing…");
      try {
        const pdfjs = (await import("pdfjs-dist")) as unknown as {
          GlobalWorkerOptions: { workerSrc: string };
          getDocument: (src: { data: Uint8Array; disableWorker?: boolean }) => {
            promise: Promise<PdfDoc>;
          };
        };
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const buffer = new Uint8Array(await file.arrayBuffer());
        const pdf = await pdfjs.getDocument({ data: buffer, disableWorker: true }).promise;
        pdfRef.current = pdf;

        setUploadLabel(`Uploading ${file.name}…`);
        const uploaded = await uploadRedlineSource(file, {
          pageCount: pdf.numPages,
          onProgress: (pct) => {
            setUploadPercent(pct);
            setUploadLabel(pct >= 100 ? "Saving drawing…" : `Uploading ${file.name}… ${pct}%`);
          },
        });
        sourceRef.current = uploaded.source;
        await loadRuns(uploaded.source.id);
        workRef.current = emptyWork(1);
        setPdfOpen(true);
        await gotoPage(1);
        refresh();
        toast(
          uploaded.reused
            ? "Opened existing drawing — other ITC runs on this plan will show together."
            : "Drawing uploaded."
        );
      } catch (error) {
        console.error(error);
        toast(error instanceof Error ? error.message : "Could not open that PDF");
      } finally {
        setUploading(false);
        setUploadPercent(0);
      }
    },
    [gotoPage, loadRuns, refresh, toast]
  );

  const hitLabel = useCallback(
    (cx: number, cy: number) => {
      const run = savedRef.current[currentRef.current];
      if (!run || hasPts(workRef.current) || run.page !== pageNoRef.current) return null;
      const label = run.label || defaultLabel(run.segs, DEF_LS, ratioRef.current);
      const box = labelBox(label, labelFor(currentRef.current), ratioRef.current);
      const page = pageRef.current;
      if (!page) return null;
      const pr = page.getBoundingClientRect();
      const p = toPage(cx, cy);
      const mx = 16 / pr.width;
      const my = 16 / pr.height;
      if (p[0] >= box.l - mx && p[0] <= box.r + mx && p[1] >= box.t - my && p[1] <= box.b + my) {
        return { dx: p[0] - label.x, dy: p[1] - label.y };
      }
      return null;
    },
    [labelFor, toPage]
  );

  const findVertex = useCallback((cx: number, cy: number): [number, number] | null => {
    const page = pageRef.current;
    if (!page) return null;
    const r = page.getBoundingClientRect();
    let best: [number, number] | null = null;
    let bd = 28;
    workRef.current.segs.forEach((seg, si) => {
      seg.forEach((p, i) => {
        const d = Math.hypot(r.left + p[0] * r.width - cx, r.top + p[1] * r.height - cy);
        if (d < bd) {
          bd = d;
          best = [si, i];
        }
      });
    });
    return best;
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const onDown = (event: PointerEvent) => {
      if (!pdfRef.current || (event.target as HTMLElement).closest("#zoomc,#pg")) return;
      stage.setPointerCapture(event.pointerId);
      const ptrs = ptrsRef.current;
      ptrs.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const g = gestureRef.current;
      if (ptrs.size === 1) {
        g.ds = {
          x: event.clientX,
          y: event.clientY,
          t: Date.now(),
          moved: false,
          px: viewRef.current.px,
          py: viewRef.current.py,
        };
        g.dragV = null;
        g.stroke = null;
        g.dragLab = null;
        if (modeRef.current === "free") {
          if (hasPts(workRef.current) && workRef.current.page !== pageNoRef.current) {
            toast(`Save or clear the run on page ${workRef.current.page} first`);
            g.ds = null;
            return;
          }
          workRef.current.page = pageNoRef.current;
          let si = workRef.current.segs.length - 1;
          if (workRef.current.segs[si].length) {
            workRef.current.segs.push([]);
            workRef.current.kinds.push("free");
            si += 1;
          }
          workRef.current.kinds[si] = "free";
          g.stroke = { si, raw: [toPage(event.clientX, event.clientY)] };
        } else if (modeRef.current === "move") {
          g.dragV = findVertex(event.clientX, event.clientY);
          if (!g.dragV && !hasPts(workRef.current) && savedRef.current[currentRef.current] && g.ds) {
            g.ds.needEdit = true;
          }
        } else if (modeRef.current === "label") {
          g.dragLab = hitLabel(event.clientX, event.clientY);
          if (!savedRef.current[currentRef.current] && !hasPts(workRef.current)) {
            toast("Save a run for this ITC first");
          }
        }
      } else if (ptrs.size === 2) {
        if (g.stroke) {
          workRef.current.segs[g.stroke.si] = [];
          workRef.current.kinds[g.stroke.si] = "tap";
          g.stroke = null;
        }
        g.dragV = null;
        g.dragLab = null;
        g.ds = null;
        const [a, b] = [...ptrs.values()];
        g.pinch = {
          d: Math.hypot(a.x - b.x, a.y - b.y) || 1,
          cx: (a.x + b.x) / 2,
          cy: (a.y + b.y) / 2,
          base: { ...viewRef.current },
        };
        draw();
      }
    };

    const onMove = (event: PointerEvent) => {
      const ptrs = ptrsRef.current;
      if (!ptrs.has(event.pointerId)) return;
      ptrs.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const g = gestureRef.current;
      if (ptrs.size === 2 && g.pinch) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        setZoom(g.pinch.base.z * d / g.pinch.d, g.pinch.cx, g.pinch.cy, cx, cy, g.pinch.base);
        return;
      }
      if (ptrs.size !== 1 || !g.ds) return;
      const dx = event.clientX - g.ds.x;
      const dy = event.clientY - g.ds.y;
      if (Math.hypot(dx, dy) > 6) g.ds.moved = true;
      if (g.stroke) {
        const p = toPage(event.clientX, event.clientY);
        const last = g.stroke.raw[g.stroke.raw.length - 1];
        const r = pageRef.current?.getBoundingClientRect();
        if (r && Math.hypot((p[0] - last[0]) * r.width, (p[1] - last[1]) * r.height) > 2) {
          g.stroke.raw.push(p);
          workRef.current.segs[g.stroke.si] = g.stroke.raw.slice();
          draw();
        }
      } else if (g.dragLab) {
        const p = toPage(event.clientX, event.clientY);
        const run = savedRef.current[currentRef.current];
        if (!run) return;
        const existing = run.label || defaultLabel(run.segs, DEF_LS, ratioRef.current);
        run.label = {
          ...existing,
          x: clamp(p[0] - g.dragLab.dx, 0, 0.99),
          y: clamp(p[1] - g.dragLab.dy, 0.01, 1),
        };
        draw();
      } else if (g.dragV) {
        workRef.current.segs[g.dragV[0]][g.dragV[1]] = toPage(event.clientX, event.clientY);
        draw();
      } else if (g.ds.moved) {
        viewRef.current.px = g.ds.px + dx;
        viewRef.current.py = g.ds.py + dy;
        clampPan();
        applyTransform();
        draw();
      }
    };

    const endPtr = (event: PointerEvent) => {
      const ptrs = ptrsRef.current;
      if (!ptrs.has(event.pointerId)) return;
      const wasOne = ptrs.size === 1;
      ptrs.delete(event.pointerId);
      const g = gestureRef.current;
      if (ptrs.size < 2) g.pinch = null;
      if (!wasOne || !g.ds) {
        if (!ptrs.size) {
          g.ds = null;
          g.stroke = null;
          g.dragV = null;
          g.dragLab = null;
        }
        return;
      }
      if (event.type === "pointercancel") {
        if (g.stroke) {
          workRef.current.segs[g.stroke.si] = [];
          workRef.current.kinds[g.stroke.si] = "tap";
        }
      } else if (g.stroke) {
        const si = g.stroke.si;
        const r = pageRef.current?.getBoundingClientRect();
        if (g.stroke.raw.length < 3 || !g.ds.moved) {
          workRef.current.segs[si] = [];
          workRef.current.kinds[si] = "tap";
        } else if (r) {
          const q = g.stroke.raw.map((p) => [p[0], p[1] / ratioRef.current] as RedlinePoint);
          const simplified = rdp(q, 2.5 / r.width).map(
            (p) => [p[0], p[1] * ratioRef.current] as RedlinePoint
          );
          workRef.current.segs[si] = simplified;
          workRef.current.segs.push([]);
          workRef.current.kinds.push("tap");
        }
      } else if (g.dragLab) {
        const run = savedRef.current[currentRef.current];
        if (run) void persistRun(run);
      } else if (g.ds.needEdit && !g.ds.moved) {
        toast("Press Edit saved run first, then drag its points");
      } else if (!g.ds.moved && modeRef.current === "tap" && Date.now() - g.ds.t < 700) {
        if (hasPts(workRef.current) && workRef.current.page !== pageNoRef.current) {
          toast(`Save or clear the run on page ${workRef.current.page} first`);
        } else {
          workRef.current.page = pageNoRef.current;
          const si = workRef.current.segs.length - 1;
          workRef.current.segs[si].push(toPage(event.clientX, event.clientY));
          workRef.current.kinds[si] = "tap";
        }
      }
      g.ds = null;
      g.stroke = null;
      g.dragV = null;
      g.dragLab = null;
      refresh();
    };

    const onWheel = (event: WheelEvent) => {
      if (!pdfRef.current) return;
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.0015);
      setZoom(viewRef.current.z * factor, event.clientX, event.clientY, event.clientX, event.clientY);
    };

    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", endPtr);
    stage.addEventListener("pointercancel", endPtr);
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerup", endPtr);
      stage.removeEventListener("pointercancel", endPtr);
      stage.removeEventListener("wheel", onWheel);
    };
  }, [applyTransform, clampPan, draw, findVertex, hitLabel, persistRun, refresh, setZoom, toPage, toast]);

  useEffect(() => {
    const onResize = () => {
      if (!pdfRef.current) return;
      layoutPage();
      fitView();
      draw();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [draw, fitView, layoutPage]);

  useEffect(() => {
    if (initialItcId && itcById.has(initialItcId)) {
      currentRef.current = initialItcId;
      setCurrentId(initialItcId);
    } else if (itcs[0] && !currentRef.current) {
      currentRef.current = itcs[0].id;
      setCurrentId(itcs[0].id);
    }
    refresh();
  }, [initialItcId, itcById, itcs, refresh]);

  const rwNow = () => pageRef.current?.getBoundingClientRect().width || pageSizeRef.current.w || 1000;

  const cleanWork = () =>
    workRef.current.segs
      .map((seg) => seg.map((p) => [+p[0].toFixed(5), +p[1].toFixed(5)] as RedlinePoint))
      .filter((seg) => seg.length);

  const handleSave = async () => {
    const segs = cleanWork();
    if (!segs.some((seg) => seg.length >= 2)) {
      toast("A run needs at least two points");
      return;
    }
    const source = sourceRef.current;
    const current = currentRef.current;
    if (!source) {
      toast("Upload the drawing first");
      return;
    }
    if (!current) {
      toast("Pick an ITC first");
      return;
    }
    const issued = itcById.get(current)?.issued;
    if (issued) {
      toast("This ITC is issued and cannot be marked up.");
      return;
    }
    if (savedRef.current[current] && workRef.current.editing !== current) {
      if (!confirm(`Replace the saved run for ${labelFor(current)}?`)) return;
    }
    const prev = savedRef.current[current];
    const label: RedlineLabel =
      prev && workRef.current.editing === current && prev.label
        ? { ...prev.label, size: prefsRef.current.lf }
        : defaultLabel(segs, prefsRef.current.lf, ratioRef.current);
    const draft: RedlineRun = {
      id: prev?.id,
      itc_id: current,
      source_id: source.id,
      segs,
      page: workRef.current.page,
      width: +prefsRef.current.wf.toFixed(6),
      opacity: prefsRef.current.op,
      label,
      drawn_by: me.authUserId,
      drawn_by_name: me.name,
      drawn_at: new Date().toISOString(),
      source: "field",
      review: "pending",
    };
    const result = await saveRedline({
      ...draft,
      drawn_by_worker_id: me.workerId,
    });
    if (result.error || !result.run) {
      toast(result.error ?? "Could not save the run");
      return;
    }
    savedRef.current[current] = result.run;
    workRef.current = emptyWork(pageNoRef.current);
    refresh();
    toast("Saved - field markup, office to review");
  };

  const showRuns = () => {
    const keys = Object.keys(savedRef.current);
    setModalHtml(
      keys.length
        ? keys
            .map((id) => {
              const run = savedRef.current[id];
              const itc = itcById.get(id);
              const n = run.segs.reduce((sum, seg) => sum + seg.length, 0);
              return `<div class="run"><div class="t"><b>${esc(itc?.number ?? id)}</b> <small>${esc(itc?.type ?? "")}</small><br><small>p${run.page} - ${run.segs.length} seg, ${n} pts - ${esc(run.drawn_by_name)} - ${new Date(run.drawn_at).toLocaleString()}<br>Field markup - office to review</small></div>
    <button data-show="${esc(id)}">Show</button><button data-del="${esc(id)}">Delete</button></div>`;
            })
            .join("")
        : "<p style='color:#6b7280'>No runs saved on this drawing yet.</p>"
    );
    setModalOpen(true);
  };

  const exportImage = async () => {
    const run = savedRef.current[currentRef.current];
    const canvas = document.createElement("canvas");
    if (!pdfRef.current || !run) {
      toast(`Save a run for ${labelFor(currentRef.current)} first`);
      return;
    }
    try {
      await renderPageTo(canvas, run.page);
      const g = canvas.getContext("2d");
      if (!g) return;
      const W = canvas.width;
      const H = canvas.height;
      g.lineCap = "round";
      g.lineJoin = "round";
      const lw = Math.max(1, (run.width || DEF_WF) * W);
      g.globalAlpha = run.opacity || DEF_OP;
      g.strokeStyle = RED;
      g.fillStyle = RED;
      g.lineWidth = lw;
      g.beginPath();
      for (const seg of run.segs) {
        if (seg.length >= 2) {
          seg.forEach((p, i) => (i ? g.lineTo(p[0] * W, p[1] * H) : g.moveTo(p[0] * W, p[1] * H)));
        }
      }
      g.stroke();
      g.beginPath();
      for (const seg of run.segs) {
        if (seg.length === 1) {
          g.moveTo(seg[0][0] * W + lw / 2, seg[0][1] * H);
          g.arc(seg[0][0] * W, seg[0][1] * H, lw / 2, 0, 7);
        }
      }
      g.fill();
      g.globalAlpha = 1;
      const f = Math.max(28, W / 90);
      const keepRatio = ratioRef.current;
      ratioRef.current = W / H;
      const label = run.label || defaultLabel(run.segs, DEF_LS, ratioRef.current);
      const leader = leaderOf(run.segs, label, labelFor(currentRef.current), ratioRef.current);
      ratioRef.current = keepRatio;
      if (leader) {
        g.beginPath();
        g.moveTo(leader.q[0] * W, leader.q[1] * H);
        g.lineTo(leader.e[0] * W, leader.e[1] * H);
        g.lineWidth = Math.max(1.5, W / 2500);
        g.strokeStyle = RED;
        g.stroke();
      }
      const fs = label.size * W;
      const number = labelFor(currentRef.current);
      g.font = `bold ${fs}px sans-serif`;
      g.textBaseline = "alphabetic";
      g.lineJoin = "round";
      g.strokeStyle = "#fff";
      g.lineWidth = fs * 0.22;
      g.strokeText(number, label.x * W, label.y * H);
      g.fillStyle = RED;
      g.fillText(number, label.x * W, label.y * H);
      g.font = `${f * 0.8}px sans-serif`;
      g.fillStyle = "#9a3412";
      g.fillText(`Field markup - office to review - ${run.drawn_by_name}`, f, H - f);
      canvas.toBlob((blob) => {
        if (blob) downloadBlob(`redline-${number}.png`, blob);
      }, "image/png");
    } catch (error) {
      console.error(error);
      toast("Could not make the image");
    }
  };

  const centerZoom = (factor: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const r = stage.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    setZoom(viewRef.current.z * factor, cx, cy, cx, cy);
  };

  return (
    <div className="redline-root fixed inset-0 z-[80]">
      <header className="rl-head">
        <Link
          href={backHref}
          className="inline-flex min-h-10 items-center rounded-lg border border-white/50 bg-white/20 px-3 text-sm font-semibold text-white"
        >
          Back
        </Link>
        <h1>
          Red line markup{" "}
          <span className="flag" style={{ marginLeft: 6 }}>
            {me.name}
          </span>
        </h1>
        <button type="button" onClick={showRuns}>
          Runs ({runCount})
        </button>
        <button
          type="button"
          onClick={() => {
            if (fileRef.current) {
              fileRef.current.value = "";
              fileRef.current.click();
            }
          }}
        >
          Open drawing
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void openFile(file);
          }}
        />
      </header>

      {uploading ? (
        <div className="upload-progress" role="status" aria-live="polite">
          <div className="upload-meta">
            <span>{uploadLabel}</span>
            <span>{uploadPercent}%</span>
          </div>
          <div className="upload-track">
            <div className="upload-fill" style={{ width: `${uploadPercent}%` }} />
          </div>
        </div>
      ) : null}

      <div className="bar">
        <select
          id="itc"
          value={currentId}
          onChange={(event) => {
            if (hasPts(workRef.current) && !confirm("Discard the unsaved drawing?")) {
              event.target.value = currentRef.current;
              return;
            }
            workRef.current = emptyWork(pageNoRef.current);
            currentRef.current = event.target.value;
            const run = savedRef.current[currentRef.current];
            if (run && pdfRef.current && run.page !== pageNoRef.current) {
              void gotoPage(run.page).then(refresh);
            } else refresh();
          }}
        >
          {itcs.length === 0 ? (
            <option value="">No ITCs loaded</option>
          ) : (
            itcs.map((itc) => (
              <option key={itc.id} value={itc.id}>
                {itc.number} - {itc.type}
              </option>
            ))
          )}
        </select>
        <span className={chip.className}>{chip.text}</span>
      </div>
      <div className="bar">
        <div className="seg" id="modes">
          {(["tap", "free", "move", "label"] as const).map((item) => (
            <button
              key={item}
              type="button"
              data-m={item}
              className={mode === item ? "on" : ""}
              onClick={() => {
                modeRef.current = item;
                refresh();
              }}
            >
              {item === "tap" ? "Tap points" : item === "free" ? "Freehand" : item === "move" ? "Move" : "Label"}
            </button>
          ))}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input
            type="checkbox"
            id="others"
            defaultChecked
            onChange={(event) => {
              othersRef.current = event.target.checked;
              draw();
            }}
          />
          Show other ITCs
        </label>
        <div className="wrap">
          Width{" "}
          <input
            type="range"
            id="wd"
            min={1}
            max={40}
            step={0.5}
            defaultValue={8}
            onInput={(event) => {
              const v = parseFloat((event.target as HTMLInputElement).value) / rwNow();
              const target = curTarget();
              if (target) {
                target.width = +v.toFixed(6);
                void persistRun(target);
              }
              prefsRef.current.wf = v;
              persistPrefs();
              draw();
            }}
          />
          <b id="wv" style={{ minWidth: 48 }}>
            {slider.width}
          </b>
        </div>
      </div>
      <div className="bar" style={{ paddingTop: 2 }}>
        <div className="wrap">
          Opacity{" "}
          <input
            type="range"
            id="op"
            min={10}
            max={100}
            step={5}
            defaultValue={40}
            onInput={(event) => {
              const v = parseFloat((event.target as HTMLInputElement).value) / 100;
              const target = curTarget();
              if (target) {
                target.opacity = v;
                void persistRun(target);
              }
              prefsRef.current.op = v;
              persistPrefs();
              draw();
            }}
          />
          <b id="ovl" style={{ minWidth: 42 }}>
            {slider.opacity}
          </b>
        </div>
        <div className="wrap">
          Label size{" "}
          <input
            type="range"
            id="ls"
            min={6}
            max={80}
            step={1}
            defaultValue={14}
            onInput={(event) => {
              const v = parseFloat((event.target as HTMLInputElement).value) / rwNow();
              const target = curTarget();
              if (target) {
                const existing = target.label || defaultLabel(target.segs, DEF_LS, ratioRef.current);
                target.label = { ...existing, size: +v.toFixed(6) };
                void persistRun(target);
              }
              prefsRef.current.lf = v;
              persistPrefs();
              draw();
            }}
          />
          <b id="lv" style={{ minWidth: 48 }}>
            {slider.label}
          </b>
        </div>
      </div>
      <div className="hint" id="hint">
        {hint}
      </div>

      <div id="stage" ref={stageRef}>
        <div id="world" ref={worldRef}>
          <div id="page" ref={pageRef}>
            <canvas id="cv" ref={canvasRef} />
            <svg id="ov" ref={overlayRef} preserveAspectRatio="none" />
          </div>
        </div>
        {!pdfOpen ? (
          <div id="empty">
            <div style={{ fontSize: 18, fontWeight: 600 }}>No drawing open</div>
            <div>Open a PDF drawing, pick the ITC, then mark its run.</div>
            <button
              type="button"
              className="pri"
              onClick={() => {
                if (fileRef.current) {
                  fileRef.current.value = "";
                  fileRef.current.click();
                }
              }}
            >
              Open drawing
            </button>
          </div>
        ) : null}
        <div id="pg" hidden={!multiPage}>
          <button
            type="button"
            onClick={() => {
              if (pageNoRef.current > 1) void gotoPage(pageNoRef.current - 1).then(refresh);
            }}
          >
            ‹
          </button>
          <span id="pNum">{pageLabel}</span>
          <button
            type="button"
            onClick={() => {
              const pdf = pdfRef.current;
              if (pdf && pageNoRef.current < pdf.numPages) {
                void gotoPage(pageNoRef.current + 1).then(refresh);
              }
            }}
          >
            ›
          </button>
        </div>
        <div id="zoomc">
          <button type="button" onClick={() => centerZoom(1.5)}>
            +
          </button>
          <button type="button" onClick={() => centerZoom(1 / 1.5)}>
            −
          </button>
          <button type="button" style={{ fontSize: 13 }} onClick={fitView}>
            Fit
          </button>
        </div>
      </div>

      <div className="acts">
        <button
          type="button"
          disabled={actions.undo}
          onClick={() => {
            const work = workRef.current;
            for (let i = work.segs.length - 1; i >= 0; i -= 1) {
              if (!work.segs[i].length) continue;
              if (work.kinds[i] === "free") work.segs[i] = [];
              else work.segs[i].pop();
              break;
            }
            while (
              work.segs.length > 1 &&
              !work.segs[work.segs.length - 1].length &&
              !work.segs[work.segs.length - 2].length
            ) {
              work.segs.pop();
              work.kinds.pop();
            }
            refresh();
          }}
        >
          Undo point
        </button>
        <button
          type="button"
          disabled={actions.next}
          onClick={() => {
            const work = workRef.current;
            if (work.segs[work.segs.length - 1].length) {
              work.segs.push([]);
              work.kinds.push("tap");
            }
            refresh();
          }}
        >
          Next segment
        </button>
        <button
          type="button"
          disabled={actions.clear}
          onClick={() => {
            workRef.current = emptyWork(pageNoRef.current);
            refresh();
          }}
        >
          Clear
        </button>
        <button
          type="button"
          className={needEdit ? "pri" : ""}
          disabled={actions.edit}
          onClick={() => {
            const run = savedRef.current[currentRef.current];
            if (!run) return;
            workRef.current = {
              segs: run.segs.map((seg) => seg.map((p) => p.slice() as RedlinePoint)),
              kinds: run.segs.map(() => "tap"),
              page: run.page,
              editing: currentRef.current,
            };
            if (run.width) prefsRef.current.wf = run.width;
            if (run.opacity) prefsRef.current.op = run.opacity;
            if (run.label) prefsRef.current.lf = run.label.size;
            modeRef.current = "move";
            if (run.page !== pageNoRef.current && pdfRef.current) {
              void gotoPage(run.page).then(refresh);
            } else refresh();
            toast("Editing - drag points, then press Save run");
          }}
        >
          Edit saved run
        </button>
        <button type="button" className="pri" disabled={actions.save} onClick={() => void handleSave()}>
          Save run
        </button>
      </div>

      <div id="modal" className={modalOpen ? "show" : ""}>
        <div id="sheet">
          <h2>Saved runs on this drawing</h2>
          <div
            id="list"
            dangerouslySetInnerHTML={{ __html: modalHtml }}
            onClick={(event) => {
              const button = (event.target as HTMLElement).closest("button");
              if (!button) return;
              const show = button.getAttribute("data-show");
              const del = button.getAttribute("data-del");
              if (show) {
                if (hasPts(workRef.current) && !confirm("Discard the unsaved drawing?")) return;
                workRef.current = emptyWork(pageNoRef.current);
                currentRef.current = show;
                setModalOpen(false);
                const run = savedRef.current[show];
                const next = pdfRef.current && run && run.page !== pageNoRef.current ? gotoPage(run.page) : Promise.resolve();
                void next.then(refresh);
              }
              if (del && confirm(`Delete the run for ${labelFor(del)}?`)) {
                const run = savedRef.current[del];
                void (async () => {
                  if (run?.id) {
                    const result = await deleteRedline(run.id);
                    if (result.error) {
                      toast(result.error);
                      return;
                    }
                  }
                  delete savedRef.current[del];
                  refresh();
                  showRuns();
                })();
              }
            }}
          />
          <div className="sfoot">
            <button
              type="button"
              onClick={() => {
                if (!pdfRef.current || !sourceRef.current) return;
                downloadBlob(
                  "redline-runs.json",
                  new Blob(
                    [
                      JSON.stringify(
                        {
                          drawing: {
                            id: sourceRef.current.id,
                            name: sourceRef.current.file_name,
                            size: sourceRef.current.file_size,
                            pages: sourceRef.current.page_count,
                          },
                          coords: "x,y are 0-1 fractions of page width/height, origin top-left",
                          runs: savedRef.current,
                        },
                        null,
                        2
                      ),
                    ],
                    { type: "application/json" }
                  )
                );
              }}
            >
              Export JSON
            </button>
            <button type="button" onClick={() => void exportImage()}>
              Save image of this ITC
            </button>
            <button type="button" className="pri" onClick={() => setModalOpen(false)}>
              Close
            </button>
          </div>
        </div>
      </div>
      <div id="toast" ref={toastRef} />
    </div>
  );
}
