"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Loader2, MessageSquarePlus, Send } from "lucide-react";
import {
  createAiConversation,
  listAiConversations,
  listAiMessages,
  sendAiChatMessage,
  type AiConversationRow,
  type AiMessageRow,
} from "@/app/actions/ai-chat";
import { cn } from "@/lib/utils";

const BRAND_ORANGE = "#F48120";

function formatConversationTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SiteBoltAIPage() {
  const [conversations, setConversations] = useState<AiConversationRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessageRow[]>([]);
  const [input, setInput] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const activeConversation = useMemo(
    () => conversations.find((row) => row.id === activeId) ?? null,
    [conversations, activeId]
  );

  const refreshConversations = useCallback(async () => {
    setLoadingList(true);
    const result = await listAiConversations();
    setLoadingList(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setConversations(result.conversations);
  }, []);

  const loadConversation = useCallback(async (conversationId: string | null) => {
    setActiveId(conversationId);
    setError(null);
    if (!conversationId) {
      setMessages([]);
      return;
    }
    setLoadingMessages(true);
    const result = await listAiMessages(conversationId);
    setLoadingMessages(false);
    if (result.error) {
      setError(result.error);
      setMessages([]);
      return;
    }
    setMessages(result.messages);
  }, []);

  useEffect(() => {
    void refreshConversations();
  }, [refreshConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const handleNewChat = async () => {
    setError(null);
    setSending(true);
    const created = await createAiConversation("New chat");
    setSending(false);
    if (created.error || !created.conversation) {
      setError(created.error ?? "Failed to start a new chat.");
      return;
    }
    setConversations((current) => [created.conversation!, ...current]);
    setActiveId(created.conversation.id);
    setMessages([]);
    setInput("");
  };

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    setInput("");

    const optimisticUser: AiMessageRow = {
      id: `local-user-${Date.now()}`,
      conversation_id: activeId ?? "new",
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimisticUser]);

    const result = await sendAiChatMessage({
      conversationId: activeId,
      content: text,
    });
    setSending(false);

    if (result.error) {
      setError(result.error);
      setMessages((current) => current.filter((row) => row.id !== optimisticUser.id));
      setInput(text);
      return;
    }

    if (result.conversation) {
      setActiveId(result.conversation.id);
      setConversations((current) => {
        const without = current.filter((row) => row.id !== result.conversation!.id);
        return [result.conversation!, ...without];
      });
    }
    setMessages(result.messages);
    void refreshConversations();
  };

  return (
    <div className="flex h-[calc(100vh-7.5rem)] min-h-[480px] w-full min-w-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <aside className="flex w-full max-w-[280px] shrink-0 flex-col border-r border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">Chats</p>
            <p className="truncate text-[11px] text-slate-500">Your history only</p>
          </div>
          <button
            type="button"
            onClick={() => void handleNewChat()}
            disabled={sending}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: BRAND_ORANGE }}
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            New Chat
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loadingList ? (
            <div className="flex items-center gap-2 px-2 py-3 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading…
            </div>
          ) : conversations.length === 0 ? (
            <p className="px-2 py-3 text-xs text-slate-500">
              No conversations yet. Start a new chat.
            </p>
          ) : (
            <ul className="space-y-1">
              {conversations.map((conversation) => {
                const active = conversation.id === activeId;
                return (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      onClick={() => void loadConversation(conversation.id)}
                      className={cn(
                        "w-full rounded-lg px-3 py-2 text-left transition",
                        active
                          ? "bg-orange-100 text-orange-950"
                          : "text-slate-800 hover:bg-white"
                      )}
                    >
                      <p className="truncate text-sm font-medium">{conversation.title}</p>
                      <p className="truncate text-[11px] text-slate-500">
                        {formatConversationTime(conversation.updated_at)}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header
          className="flex shrink-0 items-center gap-2 px-4 py-3 text-white"
          style={{ backgroundColor: BRAND_ORANGE }}
        >
          <Bot className="h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Site-Bolt AI</p>
            <p className="truncate text-xs text-white/80">
              {activeConversation?.title ?? "New conversation"}
            </p>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {loadingMessages ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading messages…
            </div>
          ) : null}

          {!loadingMessages && messages.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Ask about SWMS, plant, timesheets, projects, or document packs. Past chats stay
              private to your account.
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
                message.role === "user" ? { backgroundColor: BRAND_ORANGE } : undefined
              }
            >
              {message.content}
            </div>
          ))}

          {sending ? <p className="text-xs text-slate-500">Site-Bolt AI is typing…</p> : null}
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {error}
            </p>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={(event) => void handleSend(event)}
          className="flex shrink-0 gap-2 border-t border-slate-200 p-3"
        >
          <input
            className="min-h-11 flex-1 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            value={input}
            placeholder={sending ? "Site-Bolt AI is typing…" : "Ask Site-Bolt AI…"}
            onChange={(event) => setInput(event.target.value)}
            disabled={sending}
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-3 text-white disabled:opacity-50"
            style={{ backgroundColor: BRAND_ORANGE }}
            aria-label="Send message"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </section>
    </div>
  );
}
