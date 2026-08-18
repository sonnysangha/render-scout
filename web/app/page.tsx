import { RunStatus } from "@/components/run-status";
import { SubmitButton } from "@/components/submit-button";
import { getRun, type ScriptRun } from "@/lib/runs";
import { startScript } from "./actions";

export const dynamic = "force-dynamic";

type DemoMode = "running" | "ready";

function formError(error?: string): string | null {
  if (!error) {
    return null;
  }
  if (error === "long") {
    return "Keep the prompt under 4,000 characters.";
  }
  if (error === "limit") {
    return "Draftroom is busy or this browser has reached its run limit. Try again shortly.";
  }
  if (error === "service") {
    return "Draftroom could not start that run. Please try again shortly.";
  }
  return "Give the writers a little more to work with—at least 10 characters.";
}

function demoRun(mode: DemoMode): ScriptRun {
  const ready = mode === "ready";

  return {
    id: "demo",
    status: ready ? "done" : "running",
    research:
      "Small teams benefit most when agents handle bounded, verifiable work rather than vague end-to-end requests.\n\nUseful evidence to include:\n• Agents can research, test, and draft in parallel.\n• Human review remains the quality gate.\n• The strongest examples show faster feedback loops, not just faster typing.",
    hooks:
      "Best bet\nA five-person engineering team can now work like a team of twenty—but only if it stops treating AI like autocomplete.\n\nAlternatives\n• The biggest change in software is not who writes the code. It is how many tasks can move at once.\n• AI agents do not replace your team. They remove the queue in front of it.",
    outline: ready
      ? "1. Cold open — contrast autocomplete with parallel work\n2. The old bottleneck — every task waits for one person\n3. The writers' room model — specialist agents work at once\n4. A practical example — research, implementation, and QA\n5. Guardrails — scoped tasks and human review\n6. Takeaway — optimize the workflow, not the prompt"
      : null,
    audience: ready
      ? "Viewer\nDevelopers, founders, and technical creators who have tried AI coding tools but still work one task at a time.\n\nPromise\nShow them a concrete operating model they can use today.\n\nTone\nConfident, practical, and skeptical of hype."
      : null,
    final_script: ready
      ? `[HOOK]\nA five-person engineering team can now work like a team of twenty—but only if it stops treating AI like autocomplete.\n\n[OPEN]\nMost people use an AI coding tool exactly like a faster search box. They ask one question, wait for one answer, and then move to the next task. That can save time, but it misses the much bigger shift.\n\nThe real advantage is parallel work. While one agent researches the problem, another can map the implementation, another can look for failure cases, and another can prepare the tests. Your team is no longer waiting for every small job to move through one pair of hands.\n\n[THE OLD BOTTLENECK]\nIn a normal workflow, good ideas spend most of their life in a queue. Research waits for an engineer. Testing waits for implementation. Documentation waits for the final code. The work itself may only take an hour, but the handoffs turn it into a day.\n\n[THE NEW MODEL]\nThink of AI agents as a writers' room for software. Give each one a narrow role, a clear output, and a shared goal. Then let them work at the same time. The research agent returns evidence. The implementation agent proposes the smallest change. The reviewer looks for risk. The test agent proves whether it works.\n\nThe human still makes the decisions. That part matters. Agents are useful because they make more options available sooner—not because every answer is automatically correct.\n\n[PRACTICAL RULE]\nStart with tasks you can verify. Ask for a test result, a source, a diff, or a working screen. If you cannot describe what “done” looks like, the agent cannot reliably get you there.\n\n[CLOSE]\nThe teams that win with agents will not be the ones with the cleverest single prompt. They will be the ones that redesign their workflow so useful work can happen in parallel, then keep a human firmly at the quality gate.`
      : null,
  };
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; error?: string; demo?: string }>;
}) {
  const { id, error, demo } = await searchParams;
  const errorMessage = formError(error);
  const selectedId =
    id &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
      ? id
      : null;
  const demoMode =
    process.env.NODE_ENV !== "production" &&
    process.env.DRAFTROOM_DEMO === "true" &&
    (demo === "running" || demo === "ready")
      ? demo
      : null;
  const initialRun = demoMode
    ? demoRun(demoMode)
    : selectedId
      ? await getRun(selectedId).catch(() => null)
      : null;
  const hasRun = Boolean(demoMode || selectedId);

  return (
    <main className={`site-shell${hasRun ? " has-run" : ""}`}>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Draftroom home">
          <span className="brand-mark" aria-hidden="true">
            D
          </span>
          <span>
            <strong>Draftroom</strong>
            <small>YouTube script studio</small>
          </span>
        </a>
        <p className="render-note">
          <span aria-hidden="true" />
          Running on Render
        </p>
      </header>

      <section className="hero" aria-labelledby="page-heading">
        <div className="hero-copy">
          <p className="eyebrow">One idea. A full writers&apos; room.</p>
          <h1 id="page-heading">
            Make the video <em>worth watching.</em>
          </h1>
          <p className="lede">
            Four specialists explore your idea in parallel. A lead writer turns
            their strongest thinking into one ready-to-record script.
          </p>
        </div>

        <div className="prompt-panel" id="prompt">
          <div className="panel-heading">
            <span>Start with your idea</span>
            <span aria-hidden="true">✦</span>
          </div>
          {errorMessage ? (
            <div className="form-error form-error--panel" role="alert">
              <span aria-hidden="true">!</span>
              <p>{errorMessage}</p>
            </div>
          ) : null}
          <form action={startScript}>
            <label htmlFor="prompt-input">What should the video be about?</label>
            <textarea
              id="prompt-input"
              name="prompt"
              minLength={10}
              maxLength={4_000}
              required
              rows={6}
              placeholder="Explain the topic, the viewer, and anything the script should include…"
              aria-describedby="prompt-hint"
            />
            <div className="prompt-actions">
              <p id="prompt-hint">
                Research, hooks, structure, and audience direction run together.
              </p>
              <SubmitButton />
            </div>
          </form>
        </div>
      </section>

      {hasRun ? (
        <RunStatus
          key={demoMode ?? selectedId}
          id={selectedId ?? "demo"}
          initialRun={initialRun}
          polling={!demoMode}
        />
      ) : null}

      <footer className="site-footer">
        <span>Draftroom</span>
        <span>Orchestrated with Render Workflows</span>
      </footer>
    </main>
  );
}
