"use client";

import { useMemo, useState } from "react";
import { Bot, MessageCircle, Send, X } from "lucide-react";
import { useChat } from "@ai-sdk/react";
import { cn } from "@/lib/utils";

const BRAND_ORANGE = "#F48120";

export default function SiteBoltChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error, clearError } = useChat();

  const isBusy = status === "submitted" || status === "streaming";

  const hasMessages = messages.length > 0;

  const placeholder = useMemo(
    () => (isBusy ? "Site-Bolt AI is typing…" : "Ask Site-Bolt AI…"),
    [isBusy]
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || isBusy) return;
    clearError();
    void sendMessage({ text });
    setInput("");
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
            className="flex shrink-0 gap-2 border-t border-slate-200 p-3"
          >
            <input
              className="min-h-10 flex-1 rounded-md border border-slate-300 px-3 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              value={input}
              placeholder={placeholder}
              onChange={(event) => setInput(event.target.value)}
              disabled={isBusy}
            />
            <button
              type="submit"
              disabled={isBusy || !input.trim()}
              className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md px-3 text-white disabled:opacity-50"
              style={{ backgroundColor: BRAND_ORANGE }}
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
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
