"use client";

import { useEffect, useState } from "react";
import { AgentCard, type AgentState } from "@/components/agent-card";
import { FinalScript } from "@/components/final-script";
import type { ScriptRun } from "@/lib/runs";

const agents = [
  {
    key: "research",
    name: "Research desk",
    role: "Evidence and useful context",
  },
  {
    key: "hooks",
    name: "Hook lab",
    role: "Openings that earn attention",
  },
  {
    key: "outline",
    name: "Story editor",
    role: "Structure and narrative beats",
  },
  {
    key: "audience",
    name: "Audience strategist",
    role: "Viewer, promise, tone, and CTA",
  },
] as const;

function agentState(run: ScriptRun, content: string | null): AgentState {
  if (content) {
    return "ready";
  }
  if (run.status === "failed" || run.status === "done") {
    return "failed";
  }
  return run.status === "queued" ? "waiting" : "working";
}

function progressMessage(run: ScriptRun, ready: number): string {
  if (run.status === "queued") {
    return "Opening the writers' room";
  }
  if (run.status === "synthesizing") {
    return "The specialist briefs are in. The lead writer is drafting.";
  }
  if (run.status === "done") {
    return "Your recording draft is ready.";
  }
  if (run.status === "failed") {
    return "The workflow stopped. Completed briefs are preserved below.";
  }
  return `${ready} of 4 specialist briefs ready.`;
}

export function RunStatus({
  id,
  initialRun,
  polling = true,
}: {
  id: string;
  initialRun?: ScriptRun | null;
  polling?: boolean;
}) {
  const [run, setRun] = useState<ScriptRun | null>(initialRun ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [terminalError, setTerminalError] = useState(false);

  useEffect(() => {
    if (!polling) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function refresh() {
      try {
        const response = await fetch(`/api/runs/${id}`, { cache: "no-store" });
        if (response.status === 404) {
          if (!cancelled) {
            setLoadError("This script run could not be found.");
            setTerminalError(true);
          }
          return;
        }
        if (!response.ok) {
          throw new Error("Draftroom could not refresh this run.");
        }

        const nextRun = (await response.json()) as ScriptRun;
        if (cancelled) {
          return;
        }

        setRun(nextRun);
        setLoadError(null);
        setTerminalError(false);
        if (nextRun.status !== "done" && nextRun.status !== "failed") {
          timer = setTimeout(() => void refresh(), 2_000);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        setLoadError(
          error instanceof Error
            ? error.message
            : "Draftroom could not refresh this run.",
        );
        timer = setTimeout(() => void refresh(), 4_000);
      }
    }

    if (!run || (run.status !== "done" && run.status !== "failed")) {
      void refresh();
    }

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [id, polling]);

  if (!run) {
    return (
      <section className="run-loading" role={loadError ? "alert" : "status"}>
        {!terminalError ? (
          <span className="status-orbit" aria-hidden="true" />
        ) : null}
        <div>
          <strong>
            {terminalError
              ? "This script run is unavailable"
              : loadError
                ? "The writers' room is unavailable"
                : "Opening the writers' room"}
          </strong>
          <p>{loadError ?? "Render Workflows is preparing the parallel tasks."}</p>
          {terminalError ? <a href="#prompt">Start a new script</a> : null}
        </div>
      </section>
    );
  }

  const completed = agents.filter(({ key }) => Boolean(run[key])).length;
  const message = progressMessage(run, completed);

  return (
    <section className="run" aria-labelledby="room-heading">
      <header className="run-heading">
        <div>
          <p className="eyebrow">Parallel workflow</p>
          <h2 id="room-heading">Inside the writers&apos; room</h2>
        </div>
        <div className="run-progress" role="status" aria-live="polite">
          <span className={`run-dot run-dot--${run.status}`} aria-hidden="true" />
          <p>{message}</p>
        </div>
      </header>

      {loadError ? (
        <p className="refresh-note" role="status">
          {terminalError
            ? "This run is no longer available."
            : "Live updates paused. Draftroom is reconnecting automatically."}
        </p>
      ) : null}

      <div className="agent-grid">
        {agents.map(({ key, name, role }) => {
          const content = run[key];
          return (
            <AgentCard
              key={key}
              name={name}
              role={role}
              content={content}
              state={agentState(run, content)}
            />
          );
        })}
      </div>

      <FinalScript script={run.final_script} status={run.status} />
    </section>
  );
}
