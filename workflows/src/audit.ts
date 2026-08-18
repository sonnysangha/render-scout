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
  fetchArchiveCommentTree,
  loadRedditPost,
  type CommentFetchResult,
  type CommentTreeResult,
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
  ): Promise<CommentFetchResult> {
    return fetchAllComments(postId);
  },
);

const fetchCommentTree = task(
  { name: "fetchCommentTree", retry },
  async function fetchCommentTree(
    post: RedditPost,
  ): Promise<CommentTreeResult> {
    return fetchArchiveCommentTree(post);
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
      const fetched =
        loaded.liveComments === null
          ? await fetchComments(loaded.post.id)
          : null;
      const flatComments = fetched
        ? commentsFromRows(loaded.post, fetched.rows)
        : [];
      const treeFallback =
        fetched && !fetched.complete
          ? await fetchCommentTree(loaded.post)
          : null;
      const useTreeFallback =
        treeFallback !== null &&
        (treeFallback.comments.length > flatComments.length ||
          (treeFallback.complete &&
            treeFallback.comments.length === flatComments.length));
      const comments =
        loaded.liveComments ??
        (useTreeFallback && treeFallback
          ? treeFallback.comments
          : flatComments);
      const sourceComplete = useTreeFallback && treeFallback
        ? treeFallback.complete
        : (fetched?.complete ?? loaded.commentsComplete ?? false);
      const commentsComplete =
        sourceComplete &&
        comments.every((comment) => comment.depthKnown);
      const [highlights, room, topComments] = await Promise.all([
        rankThread(comments),
        mapThreadRoom(loaded.post, comments),
        listTopComments(comments),
      ]);
      const report: RedditReport = {
        kind: "reddit",
        version: 2,
        generatedAt: new Date().toISOString(),
        post: loaded.post,
        sample: summarizeSample(
          comments,
          loaded.post.numComments,
          commentsComplete,
        ),
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
