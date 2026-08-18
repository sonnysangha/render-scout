"use client";

import { useState } from "react";
import type { RunStatus } from "@/lib/runs";

type ScriptBlock = { kind: "cue" | "paragraph"; text: string };

function parseScript(script: string): ScriptBlock[] {
  const blocks: ScriptBlock[] = [];
  let paragraph: string[] = [];

  function flushParagraph() {
    const text = paragraph.join(" ").trim();
    if (text) {
      blocks.push({ kind: "paragraph", text });
    }
    paragraph = [];
  }

  for (const line of script.split(/\r?\n/)) {
    const text = line.trim();
    if (/^\[[^\]]+\]$/.test(text)) {
      flushParagraph();
      blocks.push({ kind: "cue", text: text.slice(1, -1) });
    } else if (!text) {
      flushParagraph();
    } else {
      paragraph.push(text);
    }
  }
  flushParagraph();
  return blocks;
}

export function FinalScript({
  script,
  status,
  briefsReady,
}: {
  script: string | null;
  status: RunStatus;
  briefsReady: boolean;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  async function copyScript() {
    if (!script) {
      return;
    }

    try {
      await navigator.clipboard.writeText(script);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    window.setTimeout(() => setCopyState("idle"), 2_000);
  }

  const failed = status === "failed" || (status === "done" && !script);
  const writing =
    !failed && !script && (briefsReady || status === "synthesizing");

  return (
    <section
      className={`final-script${script ? " final-script--ready" : ""}${writing ? " final-script--active" : ""}`}
      aria-labelledby="final-script-heading"
      aria-busy={writing}
    >
      <header className="final-script__header">
        <div>
          <p className="eyebrow">Lead writer</p>
          <h2 id="final-script-heading">Recording draft</h2>
        </div>
        {script ? (
          <button className="copy-button" type="button" onClick={copyScript}>
            {copyState === "copied"
              ? "Copied"
              : copyState === "failed"
                ? "Copy failed"
                : "Copy script"}
          </button>
        ) : (
          <span className={`draft-state${writing ? " is-working" : ""}`}>
            {failed
              ? "Not completed"
              : writing
                ? "Writing now"
                : "Waiting for briefs"}
          </span>
        )}
      </header>

      {script ? (
        <div className="script-copy">
          {parseScript(script).map((block, index) => {
            return block.kind === "cue" ? (
              <h3 key={index}>{block.text}</h3>
            ) : (
              <p key={index}>{block.text}</p>
            );
          })}
        </div>
      ) : (
        <div className="draft-placeholder">
          <span aria-hidden="true">✦</span>
          <p>
            {failed
              ? "The workflow stopped before the final draft was ready. Your completed briefs are still shown above."
              : writing
                ? "The lead writer is combining the strongest research, hook, structure, and audience direction."
                : "The lead writer starts once the specialist briefs are ready."}
          </p>
        </div>
      )}

      <span className="copy-announcement" aria-live="polite">
        {copyState === "copied"
          ? "Script copied to clipboard."
          : copyState === "failed"
            ? "Draftroom could not copy the script. Select the text and copy it manually."
            : ""}
      </span>
    </section>
  );
}
