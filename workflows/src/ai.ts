import {
  openai,
  type OpenAILanguageModelResponsesOptions,
} from "@ai-sdk/openai";
import { generateText } from "ai";

const model = openai(process.env.OPENAI_MODEL?.trim() || "gpt-5.6-luna");
const providerOptions = {
  openai: { store: false } satisfies OpenAILanguageModelResponsesOptions,
};

export async function writeWithAI(
  instructions: string,
  prompt: string,
  maxOutputTokens = 1_600,
): Promise<string> {
  const { text } = await generateText({
    model,
    instructions,
    prompt,
    maxOutputTokens,
    abortSignal: AbortSignal.timeout(120_000),
    providerOptions,
  });
  return text.trim();
}

export async function researchWithAI(prompt: string): Promise<string> {
  const { text, sources } = await generateText({
    model,
    instructions:
      "You are the research desk for a YouTube writer. Find useful, current facts and flag uncertainty. Return concise plain text with short section labels, bullet characters, and source links. Never invent a source or statistic. Do not use Markdown syntax.",
    prompt,
    tools: {
      web_search: openai.tools.webSearch({ searchContextSize: "medium" }),
    },
    toolChoice: { type: "tool", toolName: "web_search" },
    maxOutputTokens: 1_600,
    abortSignal: AbortSignal.timeout(120_000),
    providerOptions,
  });
  const links = [
    ...new Map(
      sources
        .filter((source) => source.sourceType === "url")
        .map((source) => [source.url, source]),
    ).values(),
  ];
  if (links.length === 0) {
    return text.trim();
  }
  const sourceList = links
    .map((source) => `• ${source.title || source.url}: ${source.url}`)
    .join("\n");
  return `${text.trim()}\n\nSOURCES\n${sourceList}`;
}
