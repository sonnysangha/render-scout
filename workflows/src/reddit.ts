import { setTimeout as delay } from "node:timers/promises";

export type RedditPost = {
  id: string;
  title: string;
  subreddit: string;
  author: string;
  score: number;
  upvoteRatio: number;
  numComments: number;
  createdUtc: number;
  flair: string | null;
  selftext: string;
  permalink: string;
  url: string;
  domain: string;
  nsfw: boolean;
};

export type RedditComment = {
  id: string;
  author: string;
  body: string;
  score: number;
  depth: number;
  parentId: string;
  directReplies: number;
  descendants: number;
  awards: number;
  controversiality: number;
  isOp: boolean;
  createdUtc: number;
  permalink: string;
};

export type RedditThread = {
  post: RedditPost;
  comments: RedditComment[];
};

const USER_AGENT = "web:render-scout:1.0 (by /u/render-scout-demo)";
const ARCHIVE = "https://arctic-shift.photon-reddit.com/api";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asUnix(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 1e8) {
      return numeric;
    }
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed / 1000;
    }
  }
  return 0;
}

const MAX_COMMENTS = 8000;
const MAX_PAGES = 12;
const PAGE_FULL = 100;

export function isRedditPostUrl(input: string): boolean {
  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "redd.it") {
      return /^\/[a-z0-9]+\/?$/i.test(url.pathname);
    }
    if (host !== "reddit.com" && !host.endsWith(".reddit.com")) {
      return false;
    }
    return (
      /\/r\/[^/]+\/comments\/[a-z0-9]+/i.test(url.pathname) ||
      /\/comments\/[a-z0-9]+/i.test(url.pathname) ||
      /\/r\/[^/]+\/s\/[a-z0-9]+/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function commentsPathFromUrl(url: URL): string | null {
  const comments = url.pathname.match(/\/r\/[^/]+\/comments\/[a-z0-9]+/i);
  if (comments) {
    return comments[0];
  }
  const short = url.pathname.match(/\/comments\/[a-z0-9]+/i);
  return short ? short[0] : null;
}

async function resolveCommentsPath(input: string): Promise<string> {
  const url = new URL(input);
  const host = url.hostname.replace(/^www\./, "");

  if (host === "redd.it") {
    const id = url.pathname.replace(/\//g, "");
    if (!id) {
      throw new Error("Not a Reddit post URL");
    }
    return `/comments/${id}`;
  }

  const direct = commentsPathFromUrl(url);
  if (direct) {
    return direct;
  }

  if (/\/r\/[^/]+\/s\//i.test(url.pathname)) {
    const response = await fetch(url.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
      headers: { "user-agent": USER_AGENT },
    });
    const resolved = commentsPathFromUrl(new URL(response.url));
    if (resolved) {
      return resolved;
    }
  }

  throw new Error("Paste a Reddit post URL, not a subreddit or user page");
}

function listingChildren(value: unknown): unknown[] {
  if (
    !isRecord(value) ||
    !isRecord(value.data) ||
    !Array.isArray(value.data.children)
  ) {
    return [];
  }
  return value.data.children;
}

function postIdFromPath(path: string): string | null {
  return path.match(/\/comments\/([a-z0-9]+)/i)?.[1] ?? null;
}

function parsePostData(data: Record<string, unknown>): RedditPost {
  const id = asString(data.id).replace(/^t3_/, "");
  const subreddit = asString(data.subreddit);
  const permalink =
    asString(data.permalink) || `/r/${subreddit}/comments/${id}`;
  return {
    id,
    title: asString(data.title),
    subreddit,
    author: asString(data.author),
    score: asNumber(data.score),
    upvoteRatio: asNumber(data.upvote_ratio),
    numComments: asNumber(data.num_comments),
    createdUtc: asNumber(data.created_utc),
    flair: asString(data.link_flair_text) || null,
    selftext: asString(data.selftext),
    permalink,
    url: asString(data.url),
    domain: asString(data.domain),
    nsfw: asBoolean(data.over_18),
  };
}

function parsePostListing(listing: unknown): RedditPost {
  const first = listingChildren(listing)[0];
  if (!isRecord(first) || first.kind !== "t3" || !isRecord(first.data)) {
    throw new Error("Reddit did not return a post for that URL");
  }
  return parsePostData(first.data);
}

function commentFromData(
  data: Record<string, unknown>,
  depth: number,
  op: string,
  extras: { directReplies: number; descendants: number },
): RedditComment {
  const id = asString(data.id).replace(/^t1_/, "");
  const permalink = asString(data.permalink);
  return {
    id,
    author: asString(data.author),
    body: asString(data.body),
    score: asNumber(data.score),
    depth,
    parentId: asString(data.parent_id),
    directReplies: extras.directReplies,
    descendants: extras.descendants,
    awards: asNumber(data.total_awards_received) + asNumber(data.gilded),
    controversiality: asNumber(data.controversiality),
    isOp: asString(data.author) === op || asBoolean(data.is_submitter),
    createdUtc: asUnix(data.created_utc),
    permalink: permalink || "",
  };
}

function walkComments(
  nodes: unknown[],
  depth: number,
  op: string,
  out: RedditComment[],
): number {
  let count = 0;
  for (const node of nodes) {
    if (!isRecord(node) || node.kind !== "t1" || !isRecord(node.data)) {
      continue;
    }
    const data = node.data;
    const replyListing = data.replies;
    const children = Array.isArray(replyListing)
      ? replyListing
      : isRecord(replyListing)
        ? listingChildren(replyListing)
        : [];
    const descendants = walkComments(children, depth + 1, op, out);
    out.push(
      commentFromData(data, depth, op, {
        directReplies: children.filter(
          (child) => isRecord(child) && child.kind === "t1",
        ).length,
        descendants,
      }),
    );
    count += 1 + descendants;
  }
  return count;
}

async function readJson(url: string, timeoutMs = 20000): Promise<unknown> {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${new URL(url).host}`);
  }
  return response.json();
}

function commentsFromFlat(rows: unknown[], post: RedditPost): RedditComment[] {
  const raw = rows.filter(isRecord);
  const children = new Map<string, Record<string, unknown>[]>();
  for (const row of raw) {
    const parentId = asString(row.parent_id);
    const list = children.get(parentId) ?? [];
    list.push(row);
    children.set(parentId, list);
  }

  const out: RedditComment[] = [];
  function walk(parentId: string, depth: number): number {
    const nodes = children.get(parentId) ?? [];
    let count = 0;
    for (const data of nodes) {
      const id = asString(data.id).replace(/^t1_/, "");
      const descendants = walk(`t1_${id}`, depth + 1);
      out.push(
        commentFromData(data, depth, post.author, {
          directReplies: (children.get(`t1_${id}`) ?? []).length,
          descendants,
        }),
      );
      if (!asString(data.permalink)) {
        const last = out[out.length - 1];
        if (last) {
          last.permalink = `${post.permalink}${id}`;
        }
      }
      count += 1 + descendants;
    }
    return count;
  }
  walk(`t3_${post.id}`, 0);
  const seen = new Set(out.map((comment) => comment.id));
  for (const data of raw) {
    const id = asString(data.id).replace(/^t1_/, "");
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push(
      commentFromData(data, 1, post.author, {
        directReplies: (children.get(`t1_${id}`) ?? []).length,
        descendants: 0,
      }),
    );
  }
  return out;
}

async function searchCommentPage(
  postId: string,
  after: number | null,
): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams({
    link_id: postId,
    limit: "auto",
    sort: "asc",
  });
  if (after !== null) {
    params.set("after", String(after));
  }

  let lastError = new Error("Comment search failed");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const payload = await readJson(
        `${ARCHIVE}/comments/search?${params.toString()}`,
        40000,
      );
      return isRecord(payload) && Array.isArray(payload.data)
        ? payload.data.filter(isRecord)
        : [];
    } catch (error) {
      lastError = error instanceof Error ? error : lastError;
      await delay(800 * (attempt + 1));
    }
  }
  throw lastError;
}

export async function fetchAllComments(
  postId: string,
): Promise<Record<string, unknown>[]> {
  const collected: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let after: number | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    let rows: Record<string, unknown>[];
    try {
      rows = await searchCommentPage(postId, after);
    } catch (error) {
      if (collected.length > 0) {
        return collected;
      }
      throw error;
    }

    if (rows.length === 0) {
      break;
    }

    let newest = after ?? 0;
    let added = 0;
    for (const row of rows) {
      const id = asString(row.id).replace(/^t1_/, "");
      newest = Math.max(newest, asUnix(row.created_utc));
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);
      collected.push(row);
      added += 1;
    }

    if (added === 0) {
      after = (after ?? newest) + 1;
      continue;
    }

    if (collected.length >= MAX_COMMENTS || rows.length < PAGE_FULL) {
      return collected.slice(0, MAX_COMMENTS);
    }

    after = newest;
    await delay(400);
  }

  return collected;
}

export function commentsFromRows(
  post: RedditPost,
  rows: Record<string, unknown>[],
): RedditComment[] {
  const unique = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const id = asString(row.id).replace(/^t1_/, "");
    if (id) {
      unique.set(id, row);
    }
  }
  return commentsFromFlat([...unique.values()].slice(0, MAX_COMMENTS), post);
}

async function fetchPostFromArchive(postId: string): Promise<RedditPost> {
  const postPayload = await readJson(`${ARCHIVE}/posts/ids?ids=${postId}`);
  const postRows =
    isRecord(postPayload) && Array.isArray(postPayload.data)
      ? postPayload.data
      : [];
  const postRow = postRows[0];
  if (!isRecord(postRow)) {
    throw new Error(
      "Could not find that Reddit post yet. Try a thread that is a few hours old.",
    );
  }
  return parsePostData(postRow);
}

export async function loadRedditPost(input: string): Promise<{
  post: RedditPost;
  liveComments: RedditComment[] | null;
}> {
  if (!isRedditPostUrl(input)) {
    throw new Error("Paste a Reddit post URL");
  }

  const path = await resolveCommentsPath(input);
  const postId = postIdFromPath(path);
  if (!postId) {
    throw new Error("Could not read a post id from that URL");
  }

  try {
    return {
      post: await fetchPostFromArchive(postId),
      liveComments: null,
    };
  } catch {
    const live = await fetchFromReddit(path);
    return { post: live.post, liveComments: live.comments };
  }
}

async function fetchCollapsedTree(post: RedditPost): Promise<RedditComment[]> {
  const treePayload = await readJson(
    `${ARCHIVE}/comments/tree?link_id=t3_${post.id}`,
  );
  const nodes =
    isRecord(treePayload) && Array.isArray(treePayload.data)
      ? treePayload.data
      : [];
  const comments: RedditComment[] = [];
  walkComments(nodes, 0, post.author, comments);
  return comments;
}

async function fetchFromArchive(postId: string): Promise<RedditThread> {
  const post = await fetchPostFromArchive(postId);
  const rows = await fetchAllComments(post.id);
  const comments = commentsFromRows(post, rows);
  if (comments.length > 0) {
    return { post, comments };
  }
  return { post, comments: await fetchCollapsedTree(post) };
}

async function fetchFromReddit(path: string): Promise<RedditThread> {
  const query = "raw_json=1&limit=500&depth=8&sort=top";
  const urls = [
    `https://www.reddit.com${path}.json?${query}`,
    `https://old.reddit.com${path}.json?${query}`,
  ];
  let lastError = "Reddit blocked the live JSON feed";
  for (const url of urls) {
    try {
      const payload = await readJson(url);
      if (!Array.isArray(payload) || payload.length < 2) {
        lastError = "Unexpected Reddit JSON";
        continue;
      }
      const post = parsePostListing(payload[0]);
      const comments: RedditComment[] = [];
      walkComments(listingChildren(payload[1]), 0, post.author, comments);
      return { post, comments };
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }
  throw new Error(lastError);
}

export async function fetchRedditThread(input: string): Promise<RedditThread> {
  if (!isRedditPostUrl(input)) {
    throw new Error("Paste a Reddit post URL");
  }

  const path = await resolveCommentsPath(input);
  const postId = postIdFromPath(path);
  if (!postId) {
    throw new Error("Could not read a post id from that URL");
  }

  try {
    return await fetchFromArchive(postId);
  } catch (archiveError) {
    try {
      return await fetchFromReddit(path);
    } catch {
      throw archiveError;
    }
  }
}
