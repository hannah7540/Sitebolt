"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bot, MessageCircle, Paperclip, Send, X } from "lucide-react";
import { useChat } from "@ai-sdk/react";
import { resolveAuthWorkerFromSession } from "@/lib/auth-profile";
import { isHiredLabourWorker } from "@/lib/hired-labour";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { isSubcontractorWorker } from "@/lib/worker-utils";

const BRAND_ORANGE = "#F48120";

const FORBIDDEN_ROUTE_PREFIXES = [
  "/guest",
  "/subcontractors",
  "/hired-labour",
  "/swms/sign",
  "/onboarding/hired-labour",
] as const;

const BLOCKED_ROLES = new Set(["subcontractor", "guest", "hired_labour"]);

const INTERNAL_ADMIN_ROLES = new Set([
  "owner",
  "super_admin",
  "master_admin",
  "full_access",
  "project_team",
]);

function normalizeLabel(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function isForbiddenChatRoute(pathname: string | null): boolean {
  const path = (pathname ?? "").split("?")[0].toLowerCase();
  if (!path) return false;
  return FORBIDDEN_ROUTE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}

function isBlockedChatRole(...values: Array<string | null | undefined>): boolean {
  return values.some((value) => BLOCKED_ROLES.has(normalizeLabel(value)));
}

export default function SiteBoltChatWidget() {
  const pathname = usePathname();
  const [allowed, setAllowed] = useState(false);
  const forbiddenRoute = isForbiddenChatRoute(pathname);

  useEffect(() => {
    if (forbiddenRoute) {
      setAllowed(false);
      return;
    }

    let cancelled = false;

    async function loadInternalAccess() {
      const session = await resolveAuthWorkerFromSession();
      if (cancelled) return;

      if (!session.hasSession) {
        setAllowed(false);
        return;
      }

      if (!session.workerId) {
        setAllowed(INTERNAL_ADMIN_ROLES.has(normalizeLabel(session.role)));
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("workers")
        .select(
          "worker_category, is_subcontractor, subcontractor_id, worker_type, employment_type"
        )
        .eq("id", session.workerId)
        .maybeSingle();

      if (cancelled) return;

      if (error || !data) {
        setAllowed(INTERNAL_ADMIN_ROLES.has(normalizeLabel(session.role)));
        return;
      }

      const worker = data as {
        worker_category?: string | null;
        is_subcontractor?: boolean | null;
        subcontractor_id?: string | null;
        worker_type?: string | null;
        employment_type?: string | null;
      };

      if (
        isBlockedChatRole(
          session.role,
          worker.worker_category,
          worker.employment_type,
          worker.worker_type
        ) ||
        isHiredLabourWorker(worker) ||
        isSubcontractorWorker(worker)
      ) {
        setAllowed(false);
        return;
      }

      setAllowed(true);
    }

    void loadInternalAccess();
    return () => {
      cancelled = true;
    };
  }, [forbiddenRoute, pathname]);

  if (forbiddenRoute || !allowed) return null;

  return <SiteBoltChatPanel />;
}

const ACCEPTED_UPLOADS = "application/pdf,image/png,image/jpeg,image/webp,image/gif,.pdf";
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

function toFileList(files: File[]): FileList {
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  return transfer.files;
}

function SiteBoltChatPanel() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { messages, sendMessage, status, error, clearError } = useChat();

  const isBusy = status === "submitted" || status === "streaming";

  const hasMessages = messages.length > 0;

  const placeholder = useMemo(
    () => (isBusy ? "Site-Bolt AI is typing…" : "Ask Site-Bolt AI…"),
    [isBusy]
  );

  const handleFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (selected.length === 0) return;

    const next: File[] = [...files];
    for (const file of selected) {
      if (file.size > MAX_UPLOAD_BYTES) {
        setUploadError(`${file.name} is larger than 8 MB.`);
        continue;
      }
      const duplicate = next.some(
        (existing) => existing.name === file.name && existing.size === file.size
      );
      if (!duplicate) next.push(file);
    }
    if (next.length > files.length) setUploadError(null);
    setFiles(next);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (isBusy || (!text && files.length === 0)) return;
    clearError();
    setUploadError(null);
    if (files.length > 0) {
      void sendMessage({
        text: text || "Summarize this.",
        files: toFileList(files),
      });
    } else {
      void sendMessage({ text });
    }
    setInput("");
    setFiles([]);
  };

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3">
      {open ? (
        <div
          className="pointer-events-auto flex h-[600px] max-h-[80vh] w-96 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
          role="dialog"
          aria-label="Site-Bolt AI chat"
        >
          <div
            className="flex shrink-0 items-center justify-between px-4 py-3 text-white"
            style={{ backgroundColor: BRAND_ORANGE }}
          >
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <div>
                <p className="text-sm font-semibold leading-tight">Site-Bolt AI</p>
                <p className="text-xs text-white/80">Construction assistant</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1.5 hover:bg-white/15"
              aria-label="Close chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {!hasMessages ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                Ask a question about SWMS, plant, timesheets, or the document pack.
              </p>
            ) : null}

            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                  message.role === "user"
                    ? "ml-auto text-white"
                    : "mr-auto border border-slate-200 bg-slate-50 text-slate-800"
                )}
                style={
                  message.role === "user"
                    ? { backgroundColor: BRAND_ORANGE }
                    : undefined
                }
              >
                {message.parts.map((part, index) => {
                  if (part.type === "file") {
                    const isImage = part.mediaType.startsWith("image/");
                    return (
                      <span key={`${message.id}-${index}`} className="mt-1 block">
                        {isImage ? (
                          <img
                            src={part.url}
                            alt={part.filename ?? "Uploaded image"}
                            className="mt-1 max-h-24 max-w-full rounded border border-white/30 object-contain"
                          />
                        ) : (
                          <span className="block truncate text-xs opacity-90">
                            {part.filename ?? "Attachment"}
                          </span>
                        )}
                      </span>
                    );
                  }
                  if (part.type !== "text") return null;
                  return <span key={`${message.id}-${index}`}>{part.text}</span>;
                })}
              </div>
            ))}

            {isBusy ? (
              <p className="text-xs text-slate-500">Thinking…</p>
            ) : null}

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                {error.message || "Site-Bolt AI could not respond. Try again."}
              </p>
            ) : null}
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex shrink-0 flex-col gap-2 border-t border-slate-200 p-3"
          >
            {files.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {files.map((file) => (
                  <span
                    key={`${file.name}-${file.size}-${file.lastModified}`}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700"
                  >
                    <span className="truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setFiles((current) =>
                          current.filter(
                            (row) =>
                              !(
                                row.name === file.name &&
                                row.size === file.size &&
                                row.lastModified === file.lastModified
                              )
                          )
                        )
                      }
                      className="rounded-full p-0.5 hover:bg-slate-200"
                      aria-label={`Remove ${file.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            {uploadError ? (
              <p className="text-xs text-red-700">{uploadError}</p>
            ) : null}
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_UPLOADS}
                className="hidden"
                onChange={handleFilesSelected}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isBusy}
                className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                aria-label="Attach files"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <input
                className="min-h-10 flex-1 rounded-md border border-slate-300 px-3 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                value={input}
                placeholder={placeholder}
                onChange={(event) => setInput(event.target.value)}
                disabled={isBusy}
              />
              <button
                type="submit"
                disabled={isBusy || (!input.trim() && files.length === 0)}
                className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md px-3 text-white disabled:opacity-50"
                style={{ backgroundColor: BRAND_ORANGE }}
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg"
        style={{ backgroundColor: BRAND_ORANGE }}
        aria-label={open ? "Hide Site-Bolt AI" : "Open Site-Bolt AI"}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </div>
  );
}
