"use client";

import { useEffect, useState } from "react";

export function AuditStatus({ id }: { id: string }) {
  const [text, setText] = useState("Loading audit " + id + "…");

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const res = await fetch("/api/audits/" + id);
      if (cancelled) {
        return;
      }
      if (!res.ok) {
        setText("Audit " + id + " not found.");
        return;
      }
      setText(JSON.stringify(await res.json(), null, 2));
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

  return <pre>{text}</pre>;
}
