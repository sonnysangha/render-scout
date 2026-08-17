import { task } from "@renderinc/sdk/workflows";
import { setAudit } from "./db.js";
import {
  mapRoom,
  pickTopComments,
  rankHighlights,
  summarizeSample,
  type RedditReport,
} from "./insights.js";
import {
  commentsFromRows,
  fetchAllComments,
  loadRedditPost,
  type RedditComment,
  type RedditPost,
} from "./reddit.js";

const retry = {
  maxRetries: 3,
  waitDurationMs: 1000,
  backoffScaling: 1.5,
};

const fetchPost = task(
  { name: "fetchPost", retry },
  async function fetchPost(url: string) {
    return loadRedditPost(url);
  },
);

const fetchComments = task(
  { name: "fetchAllComments", retry },
  async function fetchComments(
    postId: string,
  ): Promise<Record<string, unknown>[]> {
    return fetchAllComments(postId);
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
      const loaded = await fetchPost(url);
      const rows =
        loaded.liveComments === null
          ? await fetchComments(loaded.post.id)
          : [];
      const comments =
        loaded.liveComments ?? commentsFromRows(loaded.post, rows);
      const [highlights, room, topComments] = await Promise.all([
        rankThread(comments),
        mapThreadRoom(loaded.post, comments),
        listTopComments(comments),
      ]);
      const report: RedditReport = {
        kind: "reddit",
        post: loaded.post,
        sample: summarizeSample(comments, loaded.post.numComments),
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
