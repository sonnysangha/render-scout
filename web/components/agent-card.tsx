export type AgentState = "waiting" | "working" | "ready" | "failed";

const stateLabel: Record<AgentState, string> = {
  waiting: "Waiting",
  working: "Working",
  ready: "Ready",
  failed: "Stopped",
};

export function AgentCard({
  name,
  role,
  content,
  state,
}: {
  name: string;
  role: string;
  content: string | null;
  state: AgentState;
}) {
  return (
    <article
      className={`agent-card agent-card--${state}`}
      aria-busy={state === "working"}
    >
      <header className="agent-card__header">
        <div>
          <p className="agent-role">{role}</p>
          <h3>{name}</h3>
        </div>
        <span className="agent-state">
          <span aria-hidden="true" />
          {stateLabel[state]}
        </span>
      </header>

      {content ? (
        <div className="agent-output">
          {content.split(/\n\n+/).map((paragraph, index) => (
            <p key={`${name}-${index}`}>{paragraph}</p>
          ))}
        </div>
      ) : state === "failed" ? (
        <p className="agent-placeholder">
          This specialist did not return a brief. Start another run to try again.
        </p>
      ) : state === "working" ? (
        <div className="agent-working" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ) : (
        <p className="agent-placeholder">Ready when the workflow reaches this desk.</p>
      )}
    </article>
  );
}
