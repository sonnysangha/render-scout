import { task } from "@renderinc/sdk/workflows";
import { setAudit } from "./db.js";

type CrawledPage = {
  url: string;
  title: string;
  links: string[];
};

type PageAnalysis = {
  url: string;
  title: string;
  description: string;
  headings: string[];
};

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
    headers: { "user-agent": "render-scout/1.0" },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

function extractTitle(html: string): string {
  return html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "";
}

function extractDescription(html: string): string {
  return (
    html
      .match(
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
      )?.[1]
      ?.trim() ?? ""
  );
}

function extractHeadings(html: string): string[] {
  return [...html.matchAll(/<h1[^>]*>(.*?)<\/h1>/gis)]
    .map((match) => match[1].replace(/<[^>]+>/g, "").trim())
    .filter(Boolean)
    .slice(0, 5);
}

function extractLinks(html: string, base: string): string[] {
  const origin = new URL(base).origin;
  const found = new Set<string>();

  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    try {
      const next = new URL(match[1], base);
      if (next.origin !== origin || !next.protocol.startsWith("http")) {
        continue;
      }
      next.hash = "";
      if (next.toString() !== base) {
        found.add(next.toString());
      }
    } catch {
      // skip invalid hrefs
    }
  }

  return [...found].slice(0, 3);
}

const crawlSite = task(
  {
    name: "crawlSite",
    retry: {
      maxRetries: 3,
      waitDurationMs: 1000,
      backoffScaling: 1.5,
    },
  },
  async function crawlSite(url: string): Promise<CrawledPage> {
    const html = await fetchHtml(url);
    return {
      url,
      title: extractTitle(html),
      links: extractLinks(html, url),
    };
  },
);

const analyzePage = task(
  {
    name: "analyzePage",
    retry: {
      maxRetries: 3,
      waitDurationMs: 1000,
      backoffScaling: 1.5,
    },
  },
  async function analyzePage(url: string): Promise<PageAnalysis> {
    const html = await fetchHtml(url);
    return {
      url,
      title: extractTitle(html),
      description: extractDescription(html),
      headings: extractHeadings(html),
    };
  },
);

const writeReport = task(
  { name: "writeReport" },
  async function writeReport(
    auditId: number,
    pages: PageAnalysis[],
  ): Promise<{ auditId: number; pages: number }> {
    await setAudit(auditId, {
      status: "done",
      report: { pages },
    });
    return { auditId, pages: pages.length };
  },
);

task(
  { name: "startAudit" },
  async function startAudit(
    auditId: number,
    url: string,
  ): Promise<{ auditId: number; pages: number }> {
    try {
      await setAudit(auditId, { status: "running" });
      const home = await crawlSite(url);
      const targets = [home.url, ...home.links].slice(0, 3);
      const pages = await Promise.all(
        targets.map((target) => analyzePage(target)),
      );
      return await writeReport(auditId, pages);
    } catch (error) {
      await setAudit(auditId, {
        status: "failed",
        report: {
          error: error instanceof Error ? error.message : "audit failed",
        },
      });
      throw error;
    }
  },
);
