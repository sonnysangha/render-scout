import { AuditStatus } from "@/components/audit-status";
import { listAudits } from "@/lib/audits";
import { asRedditReport } from "@/lib/report";
import { startAudit } from "./actions";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; error?: string }>;
}) {
  const { id, error } = await searchParams;
  const audits = await listAudits().catch(() => []);

  return (
    <main>
      <h1>Scout</h1>
      <p className="lede">
        Paste a Reddit post. Render Workflows pages through the thread, then
        fans out ranking, room signal, and the comments that actually moved the
        score.
      </p>
      <form action={startAudit}>
        <label className="visually-hidden" htmlFor="url">
          Reddit post URL
        </label>
        <input
          id="url"
          name="url"
          type="url"
          required
          placeholder="https://www.reddit.com/r/…/comments/…"
        />
        <button type="submit">Read the room</button>
      </form>
      {error === "reddit" ? (
        <p className="status error">
          That has to be a Reddit post URL, not a homepage or subreddit.
        </p>
      ) : null}
      {id ? <AuditStatus id={id} /> : null}
      {audits.length > 0 ? (
        <ul className="history">
          {audits.map((audit) => {
            const report = asRedditReport(audit.report);
            return (
              <li key={audit.id}>
                <a href={`/?id=${audit.id}`}>
                  {report?.post.title ?? audit.url}
                  <span>{audit.status}</span>
                </a>
              </li>
            );
          })}
        </ul>
      ) : null}
    </main>
  );
}
