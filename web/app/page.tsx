import { AuditStatus } from "@/components/audit-status";
import { getAudit, listAudits } from "@/lib/audits";
import { asRedditReport } from "@/lib/report";
import { startAudit } from "./actions";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; error?: string }>;
}) {
  const { id, error } = await searchParams;
  const selectedId = id && /^\d+$/.test(id) ? Number(id) : null;
  const [audits, selectedAudit] = await Promise.all([
    listAudits().catch(() => []),
    selectedId ? getAudit(selectedId).catch(() => null) : null,
  ]);
  const history = audits
    .filter((audit) => String(audit.id) !== id)
    .slice(0, 6);

  return (
    <main className={`site-shell${id ? " has-report" : ""}`}>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Scout home">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span className="brand-copy">
            <strong>Scout</strong>
            <small>Thread intelligence</small>
          </span>
        </a>
        <p className="render-note">
          <span aria-hidden="true" />
          Powered by Render Workflows
        </p>
      </header>

      <section className={`scanner${id ? " scanner--compact" : ""}`}>
        <div className="intro-copy">
          <p className="eyebrow">Reddit, distilled</p>
          <h1>
            See what the thread is <em>really</em> saying.
          </h1>
          <p className="lede">
            Scout reads the full conversation and surfaces the themes,
            disagreements, and comments driving the discussion.
          </p>
        </div>

        <div className="scan-panel" id="new-scan">
          <div className="scan-panel__topline">
            <span>New analysis</span>
            <span aria-hidden="true">01</span>
          </div>
          <form className="scan-form" action={startAudit}>
            <label htmlFor="url">Reddit post URL</label>
            <div className="scan-form__row">
              <input
                id="url"
                name="url"
                type="url"
                required
                placeholder="https://reddit.com/r/…/comments/…"
                aria-describedby="url-hint"
              />
              <button type="submit">
                Analyze thread <span aria-hidden="true">→</span>
              </button>
            </div>
          </form>
          <p className="form-hint" id="url-hint">
            Available replies are ranked and summarized in one report.
          </p>
        </div>
      </section>

      {error === "reddit" ? (
        <div className="status-card status-card--error" role="alert">
          <span className="status-icon" aria-hidden="true">
            !
          </span>
          <div>
            <strong>That link is not a Reddit post.</strong>
            <p>Use the URL for a specific thread, not a homepage or subreddit.</p>
          </div>
        </div>
      ) : null}
      {id ? (
        <AuditStatus key={id} id={id} initialAudit={selectedAudit} />
      ) : null}

      {history.length > 0 ? (
        <section className="history-section" aria-labelledby="history-heading">
          <div className="section-heading section-heading--history">
            <div>
              <p className="eyebrow">Recent scans</p>
              <h2 id="history-heading">Previously analyzed</h2>
            </div>
            <span>{history.length.toString().padStart(2, "0")} reports</span>
          </div>
          <ul className="history">
            {history.map((audit) => {
              const report = asRedditReport(audit.report);
              const date = new Date(audit.created_at);
              const statusLabel = audit.status === "done" ? "Ready" : audit.status;
              return (
                <li key={audit.id}>
                  <a href={`/?id=${audit.id}`}>
                    <span className="history-index" aria-hidden="true">
                      {String(audit.id).padStart(2, "0")}
                    </span>
                    <span className="history-copy">
                      <strong>{report?.post.title ?? audit.url}</strong>
                      <small>
                        {report ? `r/${report.post.subreddit}` : "Reddit thread"}
                        {Number.isNaN(date.getTime())
                          ? ""
                          : ` · ${new Intl.DateTimeFormat("en", {
                              month: "short",
                              day: "numeric",
                              timeZone: "UTC",
                            }).format(date)}`}
                      </small>
                    </span>
                    <span
                      className={`history-status${
                        audit.status === "done" ? " is-ready" : ""
                      }`}
                    >
                      {statusLabel}
                    </span>
                    <span className="history-arrow" aria-hidden="true">
                      ↗
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <footer className="site-footer">
        <span>Scout</span>
        <span>Signal over noise.</span>
      </footer>
    </main>
  );
}
