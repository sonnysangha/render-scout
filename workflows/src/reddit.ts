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
  scoreKnown: boolean;
  depth: number;
  depthKnown: boolean;
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
  commentsComplete: boolean;
};

export type CommentFetchResult = {
  rows: Record<string, unknown>[];
  complete: boolean;
  truncated: boolean;
};

export type CommentTreeResult = {
  comments: RedditComment[];
  complete: boolean;
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

const PAGE_FULL = 100;
const MAX_COMMENTS = 8000;
const MAX_PAGES = Math.ceil(MAX_COMMENTS / PAGE_FULL) + 2;

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
  extras: {
    directReplies: number;
    descendants: number;
    depthKnown?: boolean;
  },
): RedditComment {
  const id = asString(data.id).replace(/^t1_/, "");
  const permalink = asString(data.permalink);
  const author = asString(data.author);
  return {
    id,
    author,
    body: asString(data.body),
    score: asNumber(data.score),
    scoreKnown:
      typeof data.score === "number" &&
      Number.isFinite(data.score) &&
      !asBoolean(data.score_hidden),
    depth,
    depthKnown: extras.depthKnown ?? true,
    parentId: asString(data.parent_id),
    directReplies: extras.directReplies,
    descendants: extras.descendants,
    awards: awardCount(data),
    controversiality: asNumber(data.controversiality),
    isOp:
      author.toLowerCase() === op.toLowerCase() || asBoolean(data.is_submitter),
    createdUtc: asUnix(data.created_utc),
    permalink: permalink || "",
  };
}

function awardCount(data: Record<string, unknown>): number {
  const total = asNumber(data.total_awards_received, -1);
  if (total >= 0) {
    return total;
  }

  if (Array.isArray(data.all_awardings)) {
    return data.all_awardings.reduce((sum, award) => {
      if (!isRecord(award)) {
        return sum;
      }
      return sum + Math.max(1, asNumber(award.count, 1));
    }, 0);
  }

  return Math.max(0, asNumber(data.gilded));
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
    const descendants: number = walkComments(children, depth + 1, op, out);
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
  const postFullname = `t3_${post.id.toLowerCase()}`;
  const byFullname = new Map<string, Record<string, unknown>>();

  function snapshotTime(row: Record<string, unknown>): number {
    const meta = isRecord(row._meta) ? row._meta : {};
    return Math.max(
      asUnix(row.retrieved_on),
      asUnix(row.retrieved_utc),
      asUnix(meta.retrieved_on),
      asUnix(meta.retrieved_2nd_on),
    );
  }

  function shouldReplace(
    current: Record<string, unknown>,
    candidate: Record<string, unknown>,
  ): boolean {
    const snapshotDifference = snapshotTime(candidate) - snapshotTime(current);
    if (snapshotDifference !== 0) {
      return snapshotDifference > 0;
    }
    const candidateQuality =
      Number(typeof candidate.score === "number") * 100000 +
      asString(candidate.body).length * 10 +
      asString(candidate.permalink).length;
    const currentQuality =
      Number(typeof current.score === "number") * 100000 +
      asString(current.body).length * 10 +
      asString(current.permalink).length;
    return candidateQuality > currentQuality;
  }

  for (const row of rows.filter(isRecord)) {
    const id = asString(row.id).replace(/^t1_/, "");
    if (id) {
      const fullname = `t1_${id}`;
      const current = byFullname.get(fullname);
      if (!current || shouldReplace(current, row)) {
        byFullname.set(fullname, row);
      }
    }
  }

  function parentFullname(row: Record<string, unknown>): string | null {
    const raw = asString(row.parent_id).trim().toLowerCase();
    if (!raw) {
      return null;
    }
    if (/^t[13]_/i.test(raw)) {
      return raw;
    }
    if (raw === post.id.toLowerCase()) {
      return postFullname;
    }
    return `t1_${raw}`;
  }

  const children = new Map<string, string[]>();
  for (const [fullname, row] of byFullname) {
    const parent = parentFullname(row);
    if (!parent) {
      continue;
    }
    const siblings = children.get(parent) ?? [];
    siblings.push(fullname);
    children.set(parent, siblings);
  }

  const compareRows = (left: string, right: string): number => {
    const leftRow = byFullname.get(left);
    const rightRow = byFullname.get(right);
    const timeDifference =
      asUnix(leftRow?.created_utc) - asUnix(rightRow?.created_utc);
    return timeDifference || left.localeCompare(right);
  };
  for (const siblings of children.values()) {
    siblings.sort(compareRows);
  }

  const descendantsById = new Map<string, number>();
  function countDescendants(fullname: string, trail = new Set<string>()): number {
    const cached = descendantsById.get(fullname);
    if (cached !== undefined) {
      return cached;
    }
    if (trail.has(fullname)) {
      return 0;
    }

    const nextTrail = new Set(trail);
    nextTrail.add(fullname);
    const total = (children.get(fullname) ?? []).reduce(
      (sum, child) =>
        nextTrail.has(child)
          ? sum
          : sum + 1 + countDescendants(child, nextTrail),
      0,
    );
    descendantsById.set(fullname, total);
    return total;
  }

  const depthById = new Map<string, number>();
  function depthOf(fullname: string, trail = new Set<string>()): number {
    const cached = depthById.get(fullname);
    if (cached !== undefined) {
      return cached;
    }
    if (trail.has(fullname)) {
      return 0;
    }

    const row = byFullname.get(fullname);
    if (!row) {
      return 0;
    }
    const parent = parentFullname(row);
    if (!parent) {
      depthById.set(fullname, 0);
      return 0;
    }
    if (parent === postFullname) {
      depthById.set(fullname, 0);
      return 0;
    }

    const nextTrail = new Set(trail);
    nextTrail.add(fullname);
    const depth = byFullname.has(parent) ? depthOf(parent, nextTrail) + 1 : 1;
    depthById.set(fullname, depth);
    return depth;
  }

  const depthKnownById = new Map<string, boolean>();
  function depthKnownOf(
    fullname: string,
    trail = new Set<string>(),
  ): boolean {
    const cached = depthKnownById.get(fullname);
    if (cached !== undefined) {
      return cached;
    }
    if (trail.has(fullname)) {
      return false;
    }

    const row = byFullname.get(fullname);
    if (!row) {
      return false;
    }
    const parent = parentFullname(row);
    if (!parent) {
      depthKnownById.set(fullname, false);
      return false;
    }
    if (parent === postFullname) {
      depthKnownById.set(fullname, true);
      return true;
    }
    if (!byFullname.has(parent)) {
      depthKnownById.set(fullname, false);
      return false;
    }

    const nextTrail = new Set(trail);
    nextTrail.add(fullname);
    const known = depthKnownOf(parent, nextTrail);
    depthKnownById.set(fullname, known);
    return known;
  }

  const permalinkBase = post.permalink.endsWith("/")
    ? post.permalink
    : `${post.permalink}/`;
  return [...byFullname.entries()]
    .sort(([left], [right]) => compareRows(left, right))
    .map(([fullname, data]) => {
      const id = fullname.slice(3);
      const comment = commentFromData(data, depthOf(fullname), post.author, {
        directReplies: (children.get(fullname) ?? []).length,
        descendants: countDescendants(fullname),
        depthKnown: depthKnownOf(fullname),
      });
      if (!comment.permalink) {
        comment.permalink = `${permalinkBase}${id}/`;
      }
      return comment;
    });
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
      if (!isRecord(payload) || !Array.isArray(payload.data)) {
        throw new Error("Unexpected comment search payload");
      }
      return payload.data.filter(isRecord);
    } catch (error) {
      lastError = error instanceof Error ? error : lastError;
      await delay(800 * (attempt + 1));
    }
  }
  throw lastError;
}

export async function fetchAllComments(
  postId: string,
  loadPage: (
    postId: string,
    after: number | null,
  ) => Promise<Record<string, unknown>[]> = searchCommentPage,
): Promise<CommentFetchResult> {
  const collected: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let after: number | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    let rows: Record<string, unknown>[];
    try {
      rows = await loadPage(postId, after);
    } catch (error) {
      throw error;
    }

    if (rows.length === 0) {
      return {
        rows: collected,
        complete: collected.length > 0,
        truncated: false,
      };
    }

    let newest: number = after ?? 0;
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
      const stalledAtFullBoundary = rows.length >= PAGE_FULL;
      return {
        rows: collected,
        complete: !stalledAtFullBoundary,
        truncated: stalledAtFullBoundary,
      };
    }

    if (collected.length >= MAX_COMMENTS || rows.length < PAGE_FULL) {
      const truncated = collected.length >= MAX_COMMENTS;
      return {
        rows: collected.slice(0, MAX_COMMENTS),
        complete: !truncated,
        truncated,
      };
    }

    // Overlap one second so comments sharing the page-boundary timestamp are
    // not dropped by APIs that interpret `after` as an exclusive cursor.
    after = Math.max(0, newest - 1);
    if (loadPage === searchCommentPage) {
      await delay(400);
    }
  }

  return { rows: collected, complete: false, truncated: true };
}

export function commentsFromRows(
  post: RedditPost,
  rows: Record<string, unknown>[],
): RedditComment[] {
  return commentsFromFlat(rows.slice(0, MAX_COMMENTS), post);
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
  commentsComplete: boolean | null;
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
      commentsComplete: null,
    };
  } catch {
    const live = await fetchFromReddit(path);
    return {
      post: live.post,
      liveComments: live.comments,
      commentsComplete: live.commentsComplete,
    };
  }
}

function containsMore(nodes: unknown[]): boolean {
  for (const node of nodes) {
    if (!isRecord(node)) {
      continue;
    }
    if (node.kind === "more") {
      return true;
    }
    if (node.kind !== "t1" || !isRecord(node.data)) {
      continue;
    }
    const replies = node.data.replies;
    const children = Array.isArray(replies)
      ? replies
      : isRecord(replies)
        ? listingChildren(replies)
        : [];
    if (containsMore(children)) {
      return true;
    }
  }
  return false;
}

export async function fetchArchiveCommentTree(
  post: RedditPost,
): Promise<CommentTreeResult> {
  const params = new URLSearchParams({
    link_id: `t3_${post.id}`,
    limit: String(MAX_COMMENTS),
    start_breadth: String(MAX_COMMENTS),
    start_depth: String(MAX_COMMENTS),
  });
  const treePayload = await readJson(`${ARCHIVE}/comments/tree?${params}`);
  if (!isRecord(treePayload) || !Array.isArray(treePayload.data)) {
    throw new Error("Unexpected comment tree payload");
  }
  const nodes = treePayload.data;
  const comments: RedditComment[] = [];
  walkComments(nodes, 0, post.author, comments);
  return {
    comments,
    complete:
      !containsMore(nodes) && (comments.length > 0 || post.numComments === 0),
  };
}

async function fetchFromArchive(postId: string): Promise<RedditThread> {
  const post = await fetchPostFromArchive(postId);
  const fetched = await fetchAllComments(post.id);
  const comments = commentsFromRows(post, fetched.rows);
  if (comments.length > 0) {
    return {
      post,
      comments,
      commentsComplete:
        fetched.complete && comments.every((comment) => comment.depthKnown),
    };
  }
  const collapsed = await fetchArchiveCommentTree(post);
  return {
    post,
    comments: collapsed.comments,
    commentsComplete: collapsed.complete,
  };
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
      const nodes = listingChildren(payload[1]);
      walkComments(nodes, 0, post.author, comments);
      return { post, comments, commentsComplete: !containsMore(nodes) };
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
