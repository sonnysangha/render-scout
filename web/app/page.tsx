import { AuditStatus } from "@/components/audit-status";
import { listAudits } from "@/lib/audits";
import { startAudit } from "./actions";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const audits = await listAudits().catch(() => []);

  return (
    <main>
      <h1>Scout</h1>
      <p>
        Paste a URL. Render Workflows crawls it, fans out page analysis, then
        writes a report.
      </p>
      <form action={startAudit}>
        <label className="visually-hidden" htmlFor="url">
          URL
        </label>
        <input
          id="url"
          name="url"
          type="url"
          required
          placeholder="https://render.com"
        />
        <button type="submit">Run audit</button>
      </form>
      {id ? <AuditStatus id={id} /> : <pre>No audit selected.</pre>}
      {audits.length > 0 ? (
        <ul>
          {audits.map((audit) => (
            <li key={audit.id}>
              <a href={`/?id=${audit.id}`}>
                {audit.url} — {audit.status}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
