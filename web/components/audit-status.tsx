"use client";

import { useEffect, useState } from "react";
import { AuditReport } from "@/components/audit-report";
import type { Audit } from "@/lib/audits";
import { asRedditReport, reportError } from "@/lib/report";

export function AuditStatus({ id }: { id: string }) {
  const [audit, setAudit] = useState<Audit | null>(null);
  const [message, setMessage] = useState("Opening the thread…");

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const res = await fetch("/api/audits/" + id);
      if (cancelled) {
        return;
      }
      if (!res.ok) {
        setMessage("Audit " + id + " not found.");
        return;
      }
      setAudit((await res.json()) as Audit);
    }

    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id]);

  if (!audit) {
    return <p className="status">{message}</p>;
  }

  if (audit.status === "queued" || audit.status === "running") {
    return (
      <p className="status">
        {audit.status === "queued"
          ? "Queued. Render Workflows is picking this up."
          : "Pulling the thread, then fanning out ranking, room signal, and top comments."}
      </p>
    );
  }

  const failed = reportError(audit.report);
  if (audit.status === "failed" || failed) {
    return <p className="status error">{failed ?? "The workflow failed."}</p>;
  }

  const report = asRedditReport(audit.report);
  if (!report) {
    return (
      <pre>{JSON.stringify(audit.report, null, 2)}</pre>
    );
  }

  return <AuditReport report={report} />;
}
