export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { readFileSync } from "node:fs";
import path from "node:path";
import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { getProjectHeadcount } from "@/lib/ai/tools";

const BASE_SYSTEM_PROMPT =
  "You are Site-Bolt AI, a helpful construction management assistant for A Plus Plumbing. Be concise and professional. Use getProjectHeadcount when asked how many workers are logged on a project for a given date. Review uploaded PDFs, images, and contracts and summarize them clearly.";

function loadTrainingMatrix(): string {
  const candidates = [
    path.join(process.cwd(), "src/lib/ai/knowledge/system-guide.md"),
    path.join(process.cwd(), "lib/ai/knowledge/system-guide.md"),
  ];

  for (const filePath of candidates) {
    try {
      return readFileSync(filePath, "utf8").trim();
    } catch {
      // Try the next known location so a missing bundle path does not crash the route.
    }
  }

  console.error("[Site-Bolt AI] System training guide was not found.");
  return "";
}

const TRAINING_MATRIX = loadTrainingMatrix();
const SYSTEM_PROMPT = [TRAINING_MATRIX, BASE_SYSTEM_PROMPT]
  .filter(Boolean)
  .join("\n\n");

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
