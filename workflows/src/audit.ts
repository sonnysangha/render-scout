import { task } from "@renderinc/sdk/workflows";
import { setAudit } from "./db.js";
import {
  mapRoom,
  pickTopComments,
  rankHighlights,
  summarizeSample,
  type RedditReport,
} from "./insights.js";
import { fetchRedditThread, type RedditComment, type RedditPost } from "./reddit.js";

const retry = {
  maxRetries: 3,
  waitDurationMs: 1000,
  backoffScaling: 1.5,
};

const fetchThread = task(
  { name: "fetchThread", retry },
  async function fetchThread(url: string) {
    return fetchRedditThread(url);
  },
);

const rankThread = task(
  { name: "rankThread", retry },
  function rankThread(comments: RedditComment[]) {
    return rankHighlights(comments);
  },
);

const mapThreadRoom = task(
  { name: "mapThreadRoom", retry },
  function mapThreadRoom(post: RedditPost, comments: RedditComment[]) {
    return mapRoom(post, comments);
  },
);

const listTopComments = task(
  { name: "listTopComments", retry },
  function listTopComments(comments: RedditComment[]) {
    return pickTopComments(comments);
  },
);

const writeReport = task(
  { name: "writeReport" },
  async function writeReport(
    auditId: number,
    report: RedditReport,
  ): Promise<{ auditId: number; comments: number }> {
    await setAudit(auditId, { status: "done", report });
    return { auditId, comments: report.sample.commentsLoaded };
  },
);

task(
  { name: "startAudit" },
  async function startAudit(
    auditId: number,
    url: string,
  ): Promise<{ auditId: number; comments: number }> {
    try {
      await setAudit(auditId, { status: "running" });
      const thread = await fetchThread(url);
      const [highlights, room, topComments] = await Promise.all([
        rankThread(thread.comments),
        mapThreadRoom(thread.post, thread.comments),
        listTopComments(thread.comments),
      ]);
      const report: RedditReport = {
        kind: "reddit",
        post: thread.post,
        sample: summarizeSample(thread.comments),
        highlights,
        topComments,
        room,
      };
      return await writeReport(auditId, report);
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
