export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { buildSiteBoltAiSystemPrompt } from "@/lib/ai/system-prompt";
import {
  get_compliance_status,
  get_project_worker_stats,
  getProjectHeadcount,
  search_equipment,
  search_workers,
} from "@/lib/ai/tools";

function messagesHaveFiles(messages: UIMessage[]): boolean {
  return messages.some((message) =>
    (message.parts ?? []).some((part) => part.type === "file")
  );
}

function resolveChatModel(hasFiles: boolean) {
  const modelId = hasFiles ? "gpt-4o" : "gpt-4o-mini";
  if (process.env.OPENAI_API_KEY) {
    return openai(modelId);
  }

  // Equivalent gateway model — authenticates with AI_GATEWAY_API_KEY or Vercel OIDC.
  return `openai/${modelId}` as const;
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const hasFiles = messagesHaveFiles(messages);

  const result = streamText({
    model: resolveChatModel(hasFiles),
    system: buildSiteBoltAiSystemPrompt(),
    messages: await convertToModelMessages(messages),
    tools: {
      get_project_worker_stats,
      getProjectHeadcount,
      search_workers,
      search_equipment,
      get_compliance_status,
    },
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse({
    onError: (error) => {
      console.error("[Site-Bolt AI]", error);
      return error instanceof Error
        ? error.message
        : "Site-Bolt AI could not respond.";
    },
  });
}
