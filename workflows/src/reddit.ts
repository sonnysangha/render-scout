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
  if (!isRecord(value) || !isRecord(value.data) || !Array.isArray(value.data.children)) {
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
  const permalink = asString(data.permalink) || `/r/${subreddit}/comments/${id}`;
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
    createdUtc: asNumber(data.created_utc),
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
        directReplies: children.filter((child) => isRecord(child) && child.kind === "t1")
          .length,
        descendants,
      }),
    );
    count += 1 + descendants;
  }
  return count;
}

async function readJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
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

function commentsFromFlat(
  rows: unknown[],
  post: RedditPost,
): RedditComment[] {
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
  if (out.length === 0) {
    for (const data of raw) {
      out.push(
        commentFromData(data, 0, post.author, { directReplies: 0, descendants: 0 }),
      );
    }
  }
  return out;
}

async function fetchFromArchive(postId: string): Promise<RedditThread> {
  const postPayload = await readJson(`${ARCHIVE}/posts/ids?ids=${postId}`);
  const postRows = isRecord(postPayload) && Array.isArray(postPayload.data)
    ? postPayload.data
    : [];
  const postRow = postRows[0];
  if (!isRecord(postRow)) {
    throw new Error("Could not find that Reddit post yet. Try a thread that is a few hours old.");
  }
  const post = parsePostData(postRow);

  try {
    const treePayload = await readJson(
      `${ARCHIVE}/comments/tree?link_id=t3_${postId}`,
    );
    const nodes = isRecord(treePayload) && Array.isArray(treePayload.data)
      ? treePayload.data
      : [];
    const comments: RedditComment[] = [];
    walkComments(nodes, 0, post.author, comments);
    if (comments.length > 0) {
      return { post, comments };
    }
  } catch {
    // Fall through to a flat search if the tree endpoint times out.
  }

  const commentPayload = await readJson(
    `${ARCHIVE}/comments/search?link_id=${postId}&limit=50`,
  );
  const commentRows = isRecord(commentPayload) && Array.isArray(commentPayload.data)
    ? commentPayload.data
    : [];
  return { post, comments: commentsFromFlat(commentRows, post) };
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
    return await fetchFromReddit(path);
  } catch {
    return fetchFromArchive(postId);
  }
}
