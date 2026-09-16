"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, FileText, Loader2, Search, X } from "lucide-react";
import WorkerMobileBackButton from "@/components/layout/WorkerMobileBackButton";
import { useMobileBackHandler } from "@/hooks/useMobileBackHandler";
import { useWorkerHistoryLayer } from "@/hooks/useWorkerHistoryLayer";
import {
  formatDocumentAddedDate,
  formatDocumentFileSize,
  type OrganizationDocument,
} from "@/lib/organization-documents";
import { cn } from "@/lib/utils";
import { inputClass, modalCloseIconButtonClass } from "@/lib/ui-classes";

interface WorkerUsefulDocumentsPortalProps {
  open: boolean;
  documents: OrganizationDocument[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

const EDGE_SWIPE_IGNORE_PX = 24;
const DISMISS_DISTANCE_PX = 72;
const HEADER_SWIPE_ZONE_PX = 96;

function documentCategory(document: OrganizationDocument): string {
  const name = `${document.file_name ?? ""} ${document.name}`.toLowerCase();
  if (name.includes(".pdf") || name.endsWith("pdf")) return "PDF";
  if (/\.(docx?|rtf)\b/.test(name)) return "Word";
  if (/\.(xlsx?|csv)\b/.test(name)) return "Spreadsheet";
  if (/\.(png|jpe?g|gif|webp)\b/.test(name)) return "Image";
  if (/\.(ppt|pptx)\b/.test(name)) return "Presentation";
  return "Policy / SWMS";
}

function documentTypeLabel(document: OrganizationDocument): string {
  const name = (document.file_name || document.name).toLowerCase();
  const match = name.match(/\.([a-z0-9]+)$/);
  return match?.[1] ? match[1].toUpperCase() : "FILE";
}

export default function WorkerUsefulDocumentsPortal({
  open,
  documents,
  loading,
  error,
  onClose,
}: WorkerUsefulDocumentsPortalProps) {
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; y: number; edge: boolean } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleBack = useCallback(() => {
    onClose();
    return true;
  }, [onClose]);

  useMobileBackHandler(handleBack, open);
  useWorkerHistoryLayer(open, onClose, "useful-documents");

  useEffect(() => {
    if (!open) {
      setQuery("");
      setOffset({ x: 0, y: 0 });
      setDragging(false);
      startRef.current = null;
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return documents;
    return documents.filter((document) => {
      const category = documentCategory(document).toLowerCase();
      return (
        document.name.toLowerCase().includes(needle) ||
        category.includes(needle) ||
        documentTypeLabel(document).toLowerCase().includes(needle)
      );
    });
  }, [documents, query]);

  const dismissIfSwiped = (dx: number, dy: number) => {
    const start = startRef.current;
    if (!start || start.edge) return false;
    const swipedRight = dx > DISMISS_DISTANCE_PX && dx > Math.abs(dy);
    const swipedDown =
      start.y < HEADER_SWIPE_ZONE_PX && dy > DISMISS_DISTANCE_PX && dy > Math.abs(dx);
    return swipedRight || swipedDown;
  };

  const onTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    startRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      edge: touch.clientX <= EDGE_SWIPE_IGNORE_PX,
    };
    setDragging(true);
  };

  const onTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = startRef.current;
    const touch = event.touches[0];
    if (!start || start.edge || !touch) return;
    const dx = Math.max(0, touch.clientX - start.x);
    const dy = Math.max(0, touch.clientY - start.y);
    const horizontal = dx > dy;
    if (horizontal || start.y < HEADER_SWIPE_ZONE_PX) {
      setOffset({ x: horizontal ? dx : 0, y: horizontal ? 0 : dy });
    }
  };

  const onTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = startRef.current;
    const touch = event.changedTouches[0];
    setDragging(false);
    startRef.current = null;
    if (!start || start.edge || !touch) {
      setOffset({ x: 0, y: 0 });
      return;
    }
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (dismissIfSwiped(dx, dy)) {
      onClose();
      return;
    }
    setOffset({ x: 0, y: 0 });
  };

  if (!open || typeof document === "undefined") return null;

  const translate = `translate3d(${offset.x}px, ${offset.y}px, 0)`;

  return createPortal(
    <div className="fixed inset-0 z-[70]">
      <div
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="useful-documents-title"
        className="absolute inset-0 flex flex-col bg-white shadow-2xl"
        style={{
          transform: translate,
          transition: dragging ? "none" : "transform 180ms ease-out",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          startRef.current = null;
          setDragging(false);
          setOffset({ x: 0, y: 0 });
        }}
      >
        <div className="mobile-safe-area-top flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4">
          <div>
            <h2 id="useful-documents-title" className="text-lg font-bold text-slate-900">
              Useful Documents
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Safety guides, policies, and SWMS
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={modalCloseIconButtonClass}
            aria-label="Close documents"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-slate-100 px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by title or category…"
              className={cn(inputClass, "pl-9")}
              aria-label="Search useful documents"
            />
          </div>
        </div>

        <div className="worker-mobile-content-pad min-h-0 flex-1 overflow-y-auto p-4 lg:pb-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
              Loading documents…
            </div>
          ) : error ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Documents are unavailable right now.
            </p>
          ) : filtered.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {query.trim()
                ? "No documents match that search."
                : "No useful documents have been uploaded yet."}
            </p>
          ) : (
            <ul className="space-y-3">
              {filtered.map((document) => (
                <li
                  key={document.id}
                  className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-orange-200 bg-orange-50 text-orange-600">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">{document.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {documentCategory(document)} · {documentTypeLabel(document)} ·{" "}
                        {formatDocumentFileSize(document.file_size)} · Added{" "}
                        {formatDocumentAddedDate(document.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={document.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center rounded-lg border border-orange-200 px-3 text-sm font-semibold text-orange-600 hover:bg-orange-50"
                    >
                      View
                    </a>
                    <a
                      href={document.file_url}
                      download={document.file_name || document.name}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <WorkerMobileBackButton
          label="Back"
          onClick={onClose}
          alwaysVisible
          className="z-[80]"
        />
      </div>
    </div>,
    document.body
  );
}
