import { task } from "@renderinc/sdk/workflows";
import { researchWithAI, writeWithAI } from "./ai";
import {
  completeRun,
  failRun,
  saveSpecialistOutput,
  setRunStatus,
  type Specialist,
} from "./db";

export type SpecialistOutputs = Record<Specialist, string>;

const retry = {
  maxRetries: 1,
  waitDurationMs: 1_000,
  backoffScaling: 2,
};

const specialistInstructions: Record<Exclude<Specialist, "research">, string> = {
  hooks:
    "You are a sharp YouTube hook writer. Return concise plain text with five distinct opening hooks, then name the strongest one and explain why in one sentence. Use short section labels and bullet characters, not Markdown syntax. Avoid clickbait that the video cannot deliver.",
  outline:
    "You are a YouTube story editor. Return a tight plain-text outline for an 8-12 minute video. Give each beat a purpose, key talking points, and a smooth transition. Use short section labels and bullet characters, not Markdown syntax. Build curiosity without repetition.",
  audience:
    "You are a YouTube audience strategist. Return concise plain text covering the ideal viewer, their current belief, the video's promise, tone, objections to answer, and one natural call to action. Use short section labels and bullet characters, not Markdown syntax.",
};

export function specialistPrompt(specialist: Specialist, topic: string): string {
  if (specialist === "research") {
    return `Research this proposed YouTube video: ${topic}\n\nFind the most useful facts, examples, counterpoints, and caveats the scriptwriter should know. Prefer primary sources where available.`;
  }
  return `Create the ${specialist} brief for this YouTube video idea:\n\n${topic}`;
}

export function finalPrompt(topic: string, outputs: SpecialistOutputs): string {
  return `Write the complete, ready-to-record YouTube script for this idea:\n\n${topic}\n\nRESEARCH DESK\n${outputs.research}\n\nHOOK LAB\n${outputs.hooks}\n\nSTORY EDITOR\n${outputs.outline}\n\nAUDIENCE STRATEGIST\n${outputs.audience}`;
}

const runSpecialist = task(
  { name: "runScriptSpecialist", retry, timeoutSeconds: 150 },
  async function runSpecialist(
    runId: number,
    specialist: Specialist,
    topic: string,
  ): Promise<string> {
    const prompt = specialistPrompt(specialist, topic);
    const output =
      specialist === "research"
        ? await researchWithAI(prompt)
        : await writeWithAI(specialistInstructions[specialist], prompt);
    await saveSpecialistOutput(runId, specialist, output);
    return output;
  },
);

const assembleScript = task(
  { name: "assembleYouTubeScript", retry, timeoutSeconds: 150 },
  async function assembleScript(
    runId: number,
    topic: string,
    outputs: SpecialistOutputs,
  ): Promise<string> {
    const script = await writeWithAI(
      "You are the lead YouTube scriptwriter. Combine the briefs into one natural, specific, ready-to-record plain-text script. Put short section cues in square brackets, such as [HOOK]. Open with the strongest truthful hook. Write spoken language, not an essay. Use production notes only where genuinely helpful. Do not mention the agents or briefs. End with a concise call to action. Aim for 1,300-1,700 words.",
      finalPrompt(topic, outputs),
      3_200,
    );
    await completeRun(runId, script);
    return script;
  },
);

task(
  {
    name: "writeYouTubeScript",
    retry: { maxRetries: 0, waitDurationMs: 0 },
    timeoutSeconds: 660,
  },
  async function writeYouTubeScript(
    runId: number,
    topic: string,
  ): Promise<{ runId: number }> {
    try {
      await setRunStatus(runId, "running");
      const [research, hooks, outline, audience] = await Promise.all([
        runSpecialist(runId, "research", topic),
        runSpecialist(runId, "hooks", topic),
        runSpecialist(runId, "outline", topic),
        runSpecialist(runId, "audience", topic),
      ]);
      await setRunStatus(runId, "synthesizing");
      await assembleScript(runId, topic, {
        research,
        hooks,
        outline,
        audience,
      });
      return { runId };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The script workflow failed.";
      await failRun(runId, message);
      throw error;
    }
  },
);
