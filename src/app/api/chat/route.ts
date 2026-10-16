export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { getProjectHeadcount } from "@/lib/ai/tools";

const SYSTEM_PROMPT =
  "You are Site-Bolt AI, a helpful construction management assistant for A Plus Plumbing. Be concise and professional. Use getProjectHeadcount when asked how many workers are logged on a project for a given date.";

function resolveChatModel() {
  if (process.env.OPENAI_API_KEY) {
    return openai("gpt-4o-mini");
  }

  // Equivalent gateway model — authenticates with AI_GATEWAY_API_KEY or Vercel OIDC.
  return "openai/gpt-4o-mini" as const;
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: resolveChatModel(),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: {
      getProjectHeadcount,
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
