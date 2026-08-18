"use client";

import { useEffect, useRef, useState } from "react";
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
  if (content?.trim()) {
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
  if (run.status === "done") {
    return run.final_script?.trim()
      ? "Your recording draft is ready."
      : "The workflow finished without a recording draft.";
  }
  if (run.status === "failed") {
    return "The workflow stopped. Completed briefs are preserved below.";
  }
  if (run.status === "synthesizing" || ready === agents.length) {
    return "All four briefs are ready. The lead writer is drafting.";
  }
  return `${ready} of ${agents.length} specialist briefs ready.`;
}

function completedAgentCount(run?: ScriptRun | null): number {
  return run
    ? agents.filter(({ key }) => Boolean(run[key]?.trim())).length
    : 0;
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
  const [briefsExpanded, setBriefsExpanded] = useState(
    () => completedAgentCount(initialRun) !== agents.length,
  );
  const [handoffActive, setHandoffActive] = useState(false);
  const briefsToggleRef = useRef<HTMLButtonElement>(null);
  const briefsPanelRef = useRef<HTMLDivElement>(null);
  const autoCollapsed = useRef(
    completedAgentCount(initialRun) === agents.length,
  );

  const completed = completedAgentCount(run);
  const allBriefsReady = Boolean(run && completed === agents.length);

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

  useEffect(() => {
    if (!allBriefsReady || run?.status === "failed") {
      setHandoffActive(false);
      return;
    }
    if (autoCollapsed.current) {
      setHandoffActive(false);
      return;
    }

    setHandoffActive(true);
    const collapseTimer = window.setTimeout(() => {
      if (autoCollapsed.current) {
        return;
      }
      const focused = document.activeElement;
      if (
        focused instanceof HTMLElement &&
        briefsPanelRef.current?.contains(focused)
      ) {
        briefsToggleRef.current?.focus({ preventScroll: true });
      }
      setBriefsExpanded(false);
      autoCollapsed.current = true;
    }, 520);
    const settleTimer = window.setTimeout(() => {
      setHandoffActive(false);
    }, 1_050);

    return () => {
      window.clearTimeout(collapseTimer);
      window.clearTimeout(settleTimer);
    };
  }, [allBriefsReady, run?.status]);

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

  const message = progressMessage(run, completed);
  const specialistStep =
    (run.status === "failed" || run.status === "done") && !allBriefsReady
      ? "failed"
      : allBriefsReady
        ? "complete"
        : "active";
  const finalScript = run.final_script?.trim() ? run.final_script : null;
  const recordingStep = finalScript
    ? "complete"
    : run.status === "failed" || run.status === "done"
      ? "failed"
      : allBriefsReady || run.status === "synthesizing"
        ? "active"
        : "waiting";
  const briefsPanelId = `briefs-panel-${id}`;
  const briefsToggleId = `briefs-toggle-${id}`;

  return (
    <section className="run" aria-labelledby="room-heading">
      <header className="run-heading">
        <div>
          <p className="eyebrow">Parallel workflow</p>
          <h2 id="room-heading">Inside the writers&apos; room</h2>
        </div>
        <div className="run-progress">
          <div className="workflow-steps" aria-hidden="true">
            <span className={`workflow-step workflow-step--${specialistStep}`}>
              <span>
                {specialistStep === "complete"
                  ? "✓"
                  : specialistStep === "failed"
                    ? "!"
                    : "1"}
              </span>
              Specialist briefs
            </span>
            <span
              className={`workflow-step__connector${allBriefsReady ? " is-complete" : ""}`}
            />
            <span className={`workflow-step workflow-step--${recordingStep}`}>
              <span>
                {recordingStep === "complete"
                  ? "✓"
                  : recordingStep === "failed"
                    ? "!"
                    : "2"}
              </span>
              Recording draft
            </span>
          </div>
          <p role="status" aria-live="polite">
            {message}
          </p>
        </div>
      </header>

      {loadError ? (
        <p className="refresh-note" role="status">
          {terminalError
            ? "This run is no longer available."
            : "Live updates paused. Draftroom is reconnecting automatically."}
        </p>
      ) : null}

      <div
        className={`writers-step${briefsExpanded ? " is-open" : ""}${allBriefsReady ? " is-complete" : ""}`}
      >
        <button
          ref={briefsToggleRef}
          id={briefsToggleId}
          className="writers-step__toggle"
          type="button"
          aria-expanded={briefsExpanded}
          aria-controls={briefsPanelId}
          onClick={() => {
            if (handoffActive) {
              autoCollapsed.current = true;
            }
            setBriefsExpanded((expanded) => !expanded);
            setHandoffActive(false);
          }}
        >
          <span className="writers-step__number" aria-hidden="true">
            {allBriefsReady ? "✓" : "01"}
          </span>
          <span className="writers-step__copy">
            <span>Specialist writers</span>
            <strong>
              {allBriefsReady
                ? "All four briefs are ready"
                : "Four writers, working in parallel"}
            </strong>
          </span>
          <span className="writers-step__summary">
            <span className="writers-step__pips" aria-hidden="true">
              {agents.map(({ key }) => {
                const state = agentState(run, run[key]);
                return <span key={key} className={`is-${state}`} />;
              })}
            </span>
            <span>
              {completed}/{agents.length} ready
            </span>
            <span className="writers-step__chevron" aria-hidden="true" />
          </span>
        </button>

        <div
          ref={briefsPanelRef}
          id={briefsPanelId}
          className="writers-step__panel"
          role="region"
          aria-labelledby={briefsToggleId}
          aria-hidden={!briefsExpanded}
          inert={!briefsExpanded}
        >
          <div className="writers-step__panel-inner">
            <div className="agent-grid">
              {agents.map(({ key, name, role }) => {
                const content = run[key]?.trim() ? run[key] : null;
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
          </div>
        </div>
      </div>

      <div
        className={`step-handoff${allBriefsReady ? " is-ready" : ""}${handoffActive ? " is-moving" : ""}`}
        aria-hidden="true"
      >
        <span />
        <p>
          {handoffActive
            ? "Briefs moving to the lead writer"
            : allBriefsReady
              ? "Lead writer active"
              : "The lead writer starts after all four briefs"}
        </p>
      </div>

      <FinalScript
        script={finalScript}
        status={run.status}
        briefsReady={allBriefsReady}
      />
    </section>
  );
}
