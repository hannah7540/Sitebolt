"use server";

import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs } from "ai";
import { buildSiteBoltAiSystemPrompt } from "@/lib/ai/system-prompt";
import { get_project_worker_stats, getProjectHeadcount } from "@/lib/ai/tools";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AiConversationRow = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type AiMessageRow = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

function resolveChatModel() {
  if (process.env.OPENAI_API_KEY) {
    return openai("gpt-4o-mini");
  }
  return "openai/gpt-4o-mini" as const;
}

async function requireAuthUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { error: error?.message ?? "Not authenticated.", supabase: null, user: null };
  }
  return { error: null, supabase, user };
}

function asConversation(row: Record<string, unknown>): AiConversationRow {
  return {
    id: String(row.id),
    title: String(row.title ?? "New chat"),
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

function asMessage(row: Record<string, unknown>): AiMessageRow {
  const role = String(row.role ?? "assistant");
  return {
    id: String(row.id),
    conversation_id: String(row.conversation_id),
    role:
      role === "user" || role === "system" || role === "assistant"
        ? role
        : "assistant",
    content: String(row.content ?? ""),
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

export async function listAiConversations(): Promise<{
  error: string | null;
  conversations: AiConversationRow[];
}> {
  const auth = await requireAuthUser();
  if (auth.error || !auth.supabase || !auth.user) {
    return { error: auth.error ?? "Not authenticated.", conversations: [] };
  }

  const { data, error } = await auth.supabase
    .from("ai_conversations")
    .select("id, title, created_at, updated_at")
    .eq("user_id", auth.user.id)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    return { error: error.message, conversations: [] };
  }

  return {
    error: null,
    conversations: (data ?? []).map((row) => asConversation(row as Record<string, unknown>)),
  };
}

export async function listAiMessages(conversationId: string): Promise<{
  error: string | null;
  messages: AiMessageRow[];
}> {
  const auth = await requireAuthUser();
  if (auth.error || !auth.supabase || !auth.user) {
    return { error: auth.error ?? "Not authenticated.", messages: [] };
  }

  const id = conversationId.trim();
  if (!id) return { error: "Conversation is required.", messages: [] };

  const { data: conversation, error: conversationError } = await auth.supabase
    .from("ai_conversations")
    .select("id")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (conversationError) {
    return { error: conversationError.message, messages: [] };
  }
  if (!conversation) {
    return { error: "Conversation not found.", messages: [] };
  }

  const { data, error } = await auth.supabase
    .from("ai_messages")
    .select("id, conversation_id, role, content, created_at")
    .eq("conversation_id", id)
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    return { error: error.message, messages: [] };
  }

  return {
    error: null,
    messages: (data ?? []).map((row) => asMessage(row as Record<string, unknown>)),
  };
}

export async function createAiConversation(title?: string): Promise<{
  error: string | null;
  conversation: AiConversationRow | null;
}> {
  const auth = await requireAuthUser();
  if (auth.error || !auth.supabase || !auth.user) {
    return { error: auth.error ?? "Not authenticated.", conversation: null };
  }

  const trimmed = String(title ?? "").trim() || "New chat";
  const now = new Date().toISOString();
  const { data, error } = await auth.supabase
    .from("ai_conversations")
    .insert({
      user_id: auth.user.id,
      title: trimmed.slice(0, 120),
      created_at: now,
      updated_at: now,
    })
    .select("id, title, created_at, updated_at")
    .maybeSingle();

  if (error || !data) {
    return { error: error?.message ?? "Failed to create conversation.", conversation: null };
  }

  return { error: null, conversation: asConversation(data as Record<string, unknown>) };
}

export async function sendAiChatMessage(input: {
  conversationId?: string | null;
  content: string;
}): Promise<{
  error: string | null;
  conversation: AiConversationRow | null;
  messages: AiMessageRow[];
}> {
  const auth = await requireAuthUser();
  if (auth.error || !auth.supabase || !auth.user) {
    return {
      error: auth.error ?? "Not authenticated.",
      conversation: null,
      messages: [],
    };
  }

  const content = String(input.content ?? "").trim();
  if (!content) {
    return { error: "Message is required.", conversation: null, messages: [] };
  }

  let conversationId = String(input.conversationId ?? "").trim() || null;
  let conversation: AiConversationRow | null = null;

  if (conversationId) {
    const { data, error } = await auth.supabase
      .from("ai_conversations")
      .select("id, title, created_at, updated_at")
      .eq("id", conversationId)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (error) {
      return { error: error.message, conversation: null, messages: [] };
    }
    if (!data) {
      return { error: "Conversation not found.", conversation: null, messages: [] };
    }
    conversation = asConversation(data as Record<string, unknown>);
  } else {
    const created = await createAiConversation(
      content.length > 60 ? `${content.slice(0, 57)}…` : content
    );
    if (created.error || !created.conversation) {
      return { error: created.error ?? "Failed to create conversation.", conversation: null, messages: [] };
    }
    conversation = created.conversation;
    conversationId = conversation.id;
  }

  const now = new Date().toISOString();
  const { error: userInsertError } = await auth.supabase.from("ai_messages").insert({
    conversation_id: conversationId,
    user_id: auth.user.id,
    role: "user",
    content,
    created_at: now,
  });
  if (userInsertError) {
    return { error: userInsertError.message, conversation, messages: [] };
  }

  const historyResult = await listAiMessages(conversationId);
  if (historyResult.error) {
    return { error: historyResult.error, conversation, messages: [] };
  }

  const modelMessages = historyResult.messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: message.content,
    }));

  let assistantText = "";
  try {
    const result = await generateText({
      model: resolveChatModel(),
      system: buildSiteBoltAiSystemPrompt(),
      messages: modelMessages,
      tools: {
        get_project_worker_stats,
        getProjectHeadcount,
      },
      stopWhen: stepCountIs(5),
    });
    assistantText = String(result.text ?? "").trim();
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Site-Bolt AI could not respond.";
    return { error: message, conversation, messages: historyResult.messages };
  }

  if (!assistantText) {
    assistantText = "I could not generate a response. Please try again.";
  }

  const assistantAt = new Date().toISOString();
  const { error: assistantInsertError } = await auth.supabase.from("ai_messages").insert({
    conversation_id: conversationId,
    user_id: auth.user.id,
    role: "assistant",
    content: assistantText,
    created_at: assistantAt,
  });
  if (assistantInsertError) {
    return {
      error: assistantInsertError.message,
      conversation,
      messages: historyResult.messages,
    };
  }

  const nextTitle =
    conversation?.title === "New chat"
      ? content.length > 60
        ? `${content.slice(0, 57)}…`
        : content
      : conversation?.title;

  const { data: updatedConversation } = await auth.supabase
    .from("ai_conversations")
    .update({
      updated_at: assistantAt,
      ...(nextTitle && nextTitle !== conversation?.title ? { title: nextTitle } : {}),
    })
    .eq("id", conversationId)
    .eq("user_id", auth.user.id)
    .select("id, title, created_at, updated_at")
    .maybeSingle();

  if (updatedConversation) {
    conversation = asConversation(updatedConversation as Record<string, unknown>);
  }

  const refreshed = await listAiMessages(conversationId);
  return {
    error: refreshed.error,
    conversation,
    messages: refreshed.messages,
  };
}
