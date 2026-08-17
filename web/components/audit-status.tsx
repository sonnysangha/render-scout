"use client";

import { useEffect, useState } from "react";
import { AuditReport } from "@/components/audit-report";
import type { Audit } from "@/lib/audits";
import { asRedditReport, reportError } from "@/lib/report";

export function AuditStatus({
  id,
  initialAudit,
}: {
  id: string;
  initialAudit?: Audit | null;
}) {
  const [audit, setAudit] = useState<Audit | null>(initialAudit ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function refresh() {
      try {
        const res = await fetch("/api/audits/" + id);
        if (cancelled) {
          return;
        }
        if (!res.ok) {
          setLoadError("Analysis " + id + " could not be found.");
          return;
        }
        const nextAudit = (await res.json()) as Audit;
        setAudit(nextAudit);
        if (
          !cancelled &&
          (nextAudit.status === "queued" || nextAudit.status === "running")
        ) {
          timer = setTimeout(() => void refresh(), 2000);
        }
      } catch {
        if (!cancelled) {
          setLoadError(
            "Scout could not refresh this analysis. Try again shortly.",
          );
        }
      }
    }

    if (
      !initialAudit ||
      initialAudit.status === "queued" ||
      initialAudit.status === "running"
    ) {
      void refresh();
    }

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [id, initialAudit]);

  if (!audit && loadError) {
    return (
      <div className="status-card status-card--error" role="alert">
        <span className="status-icon" aria-hidden="true">
          !
        </span>
        <div>
          <strong>This analysis is unavailable.</strong>
          <p>{loadError}</p>
        </div>
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="status-card" role="status" aria-live="polite">
        <span className="status-spinner" aria-hidden="true" />
        <div>
          <strong>Opening the analysis</strong>
          <p>Fetching the latest report from Scout.</p>
        </div>
      </div>
    );
  }

  if (audit.status === "queued" || audit.status === "running") {
    return (
      <div className="status-card" role="status" aria-live="polite">
        <span className="status-spinner" aria-hidden="true" />
        <div>
          <strong>
            {audit.status === "queued"
              ? "Your analysis is queued"
              : "Scout is reading the room"}
          </strong>
          <p>
            {audit.status === "queued"
              ? "Render Workflows is picking up the thread now."
              : "Ranking replies, finding repeated themes, and measuring the conversation."}
          </p>
        </div>
      </div>
    );
  }

  const failed = reportError(audit.report);
  if (audit.status === "failed" || failed) {
    return (
      <div className="status-card status-card--error" role="alert">
        <span className="status-icon" aria-hidden="true">
          !
        </span>
        <div>
          <strong>This analysis did not finish.</strong>
          <p>{failed ?? "The workflow failed. Please try the thread again."}</p>
        </div>
      </div>
    );
  }

  const report = asRedditReport(audit.report);
  if (!report) {
    return (
      <div className="status-card status-card--error" role="alert">
        <span className="status-icon" aria-hidden="true">
          !
        </span>
        <div>
          <strong>Scout received an unreadable report.</strong>
          <p>Run the analysis again while we keep the raw response out of view.</p>
        </div>
      </div>
    );
  }

  return <AuditReport report={report} />;
}
