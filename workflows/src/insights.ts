import type { RedditComment, RedditPost } from "./reddit.js";

export type CommentCard = {
  id: string;
  author: string;
  body: string;
  score: number;
  scoreKnown: boolean;
  depth: number;
  replies: number;
  directReplies: number;
  awards: number;
  wordCount: number;
  permalink: string;
  isOp: boolean;
};

export type RedditReport = {
  kind: "reddit";
  version: 2;
  generatedAt: string;
  post: RedditPost;
  sample: {
    commentsLoaded: number;
    commentsAnalyzed: number;
    commentsListed: number;
    complete: boolean;
    uniqueCommenters: number;
    opReplies: number;
    maxDepth: number;
    avgScore: number;
    medianScore: number;
  };
  highlights: {
    mostUpvoted: CommentCard | null;
    mostReplied: CommentCard | null;
    longest: CommentCard | null;
    mostAwarded: CommentCard | null;
    hiddenGem: CommentCard | null;
    bestOpReply: CommentCard | null;
    punchiest: CommentCard | null;
  };
  topComments: CommentCard[];
  room: {
    verdict: string;
    repeatingPhrases: string[];
    questionCount: number;
    linkCount: number;
    deletedOrRemoved: number;
    scoreSplit: { positive: number; zero: number; negative: number };
    loudestCommenter: {
      author: string;
      comments: number;
      totalScore: number;
    } | null;
  };
};

const STOP = new Set([
  "the",
  "a",
  "an",
  "and",
  "to",
  "of",
  "in",
  "is",
  "it",
  "that",
  "this",
  "for",
  "on",
  "with",
  "as",
  "was",
  "be",
  "are",
  "or",
  "if",
  "but",
  "not",
  "you",
  "i",
  "we",
  "they",
  "my",
  "your",
  "just",
  "like",
  "really",
  "also",
  "have",
  "has",
  "from",
  "at",
  "so",
  "about",
  "what",
  "when",
  "how",
  "why",
  "can",
  "will",
  "would",
  "should",
  "get",
  "got",
  "one",
  "all",
  "more",
  "than",
  "then",
  "there",
  "here",
  "out",
  "up",
  "do",
  "did",
  "dont",
  "im",
  "its",
  "me",
  "he",
  "she",
  "them",
  "their",
  "our",
  "no",
  "yes",
  "too",
  "very",
  "been",
  "were",
  "had",
  "because",
  "into",
  "over",
  "after",
  "before",
  "who",
  "which",
  "some",
  "any",
  "only",
  "even",
  "still",
  "being",
  "than",
]);

const MARKDOWN_LINK = /!?\[([^\]]*)\]\((?:\\.|[^)])*\)/g;
const REDDIT_TRACKER = /https?:\/\/alb\.reddit\.com\/cr\?[^\s)\]]+/gi;
const BARE_WEB_LINK = /(?:https?:\/\/|www\.)[^\s)\]]+/gi;

export function cleanCommentBody(body: string): string {
  return body
    .replace(MARKDOWN_LINK, "$1")
    .replace(REDDIT_TRACKER, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function readableCommentText(body: string): string {
  return cleanCommentBody(body)
    .replace(BARE_WEB_LINK, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[`*_~>#|]/g, " ")
    .replace(/&(?:amp|lt|gt|quot|#39);/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function commentWordCount(comment: RedditComment): number {
  return (
    readableCommentText(comment.body).match(
      /[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu,
    )?.length ?? 0
  );
}

function isBotAuthor(author: string): boolean {
  const normalized = author.trim().toLowerCase();
  return (
    normalized === "automoderator" ||
    /(?:^|[_-])bot(?:$|[_-])|bot$/i.test(normalized)
  );
}

function usable(comment: RedditComment): boolean {
  const author = comment.author.toLowerCase();
  const body = cleanCommentBody(comment.body);
  if (!body || /^\[(?:deleted|removed)\]$/i.test(body)) {
    return false;
  }
  if (!author || isBotAuthor(author)) {
    return false;
  }
  return true;
}

function toCard(comment: RedditComment): CommentCard {
  return {
    id: comment.id,
    author: comment.author,
    body: cleanCommentBody(comment.body),
    score: comment.score,
    scoreKnown: comment.scoreKnown,
    depth: comment.depth,
    replies: comment.descendants,
    directReplies: comment.directReplies,
    awards: comment.awards,
    wordCount: commentWordCount(comment),
    permalink: comment.permalink.startsWith("http")
      ? comment.permalink
      : `https://www.reddit.com${comment.permalink}`,
    isOp: comment.isOp,
  };
}

function pickFirst(
  comments: RedditComment[],
  compare: (left: RedditComment, right: RedditComment) => number,
): RedditComment | null {
  let best: RedditComment | null = null;
  for (const comment of comments) {
    if (!best || compare(comment, best) < 0) {
      best = comment;
    }
  }
  return best;
}

function compareStable(left: RedditComment, right: RedditComment): number {
  return left.createdUtc - right.createdUtc || left.id.localeCompare(right.id);
}

function compareScore(left: RedditComment, right: RedditComment): number {
  return (
    right.score - left.score ||
    right.descendants - left.descendants ||
    right.directReplies - left.directReplies ||
    compareStable(left, right)
  );
}

function compareDiscussion(left: RedditComment, right: RedditComment): number {
  return (
    right.descendants - left.descendants ||
    right.directReplies - left.directReplies ||
    compareScore(left, right)
  );
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const high = sorted[mid] ?? 0;
  if (sorted.length % 2 === 1) {
    return high;
  }
  return ((sorted[mid - 1] ?? 0) + high) / 2;
}

function phraseBigrams(text: string): Set<string> {
  const normalized = cleanCommentBody(text)
    .replace(BARE_WEB_LINK, "\n")
    .replace(/```[\s\S]*?```/g, "\n")
    .replace(/[`*_~>#|]/g, " ")
    .replace(/&(?:amp|lt|gt|quot|#39);/g, "\n")
    .toLowerCase();
  const matches = [
    ...normalized.matchAll(/[a-z0-9]+(?:['’][a-z0-9]+)*/g),
  ];
  const bigrams = new Set<string>();

  for (let index = 0; index < matches.length - 1; index += 1) {
    const left = matches[index];
    const right = matches[index + 1];
    const leftWord = left?.[0] ?? "";
    const rightWord = right?.[0] ?? "";
    const leftStart = left?.index ?? 0;
    const rightStart = right?.index ?? 0;
    const boundary = normalized.slice(leftStart + leftWord.length, rightStart);
    if (
      leftWord.length <= 2 ||
      rightWord.length <= 2 ||
      STOP.has(leftWord) ||
      STOP.has(rightWord) ||
      /[.!?;:\n]/.test(boundary)
    ) {
      continue;
    }
    bigrams.add(`${leftWord} ${rightWord}`);
  }

  return bigrams;
}

function repeatingPhrases(comments: RedditComment[]): string[] {
  const counts = new Map<string, { comments: number; authors: Set<string> }>();

  for (const comment of [...comments].sort(compareStable)) {
    for (const bigram of phraseBigrams(comment.body)) {
      const current = counts.get(bigram) ?? {
        comments: 0,
        authors: new Set<string>(),
      };
      current.comments += 1;
      current.authors.add(comment.author.toLowerCase());
      counts.set(bigram, current);
    }
  }

  return [...counts.entries()]
    .filter(([, stats]) => stats.comments >= 3 && stats.authors.size >= 2)
    .sort(
      ([leftPhrase, left], [rightPhrase, right]) =>
        right.comments - left.comments || leftPhrase.localeCompare(rightPhrase),
    )
    .slice(0, 5)
    .map(([phrase]) => phrase);
}

function hasMeaningfulLink(body: string): boolean {
  for (const match of body.matchAll(/!?\[([^\]]*)\]\(([^)]+)\)/g)) {
    const label = match[1]?.trim() ?? "";
    const destination = match[2]?.trim() ?? "";
    if (
      label &&
      /^(?:https?:\/\/|www\.|\/(?:r|u|comments)\/)/i.test(destination) &&
      !/^https?:\/\/alb\.reddit\.com\/cr(?:\?|$)/i.test(destination)
    ) {
      return true;
    }
  }

  const withoutMarkdownLinks = body.replace(MARKDOWN_LINK, " ");
  return [...withoutMarkdownLinks.matchAll(BARE_WEB_LINK)].some((match) => {
    try {
      const candidate = /^www\./i.test(match[0])
        ? `https://${match[0]}`
        : match[0];
      return new URL(candidate).hostname.toLowerCase() !== "alb.reddit.com";
    } catch {
      return false;
    }
  });
}

function loudest(
  comments: RedditComment[],
): RedditReport["room"]["loudestCommenter"] {
  const byAuthor = new Map<
    string,
    { author: string; comments: number; totalScore: number }
  >();
  for (const comment of comments) {
    const authorKey = comment.author.toLowerCase();
    if (comment.isOp || authorKey === "[deleted]") {
      continue;
    }
    const current = byAuthor.get(authorKey) ?? {
      author: comment.author,
      comments: 0,
      totalScore: 0,
    };
    current.comments += 1;
    current.totalScore += comment.scoreKnown ? comment.score : 0;
    byAuthor.set(authorKey, current);
  }

  let winner: RedditReport["room"]["loudestCommenter"] = null;
  for (const stats of byAuthor.values()) {
    if (
      !winner ||
      stats.comments > winner.comments ||
      (stats.comments === winner.comments &&
        (stats.totalScore > winner.totalScore ||
          (stats.totalScore === winner.totalScore &&
            stats.author.localeCompare(winner.author) < 0)))
    ) {
      winner = stats;
    }
  }
  return winner && winner.comments >= 2 ? winner : null;
}

function verdict(
  comments: RedditComment[],
  mostUpvoted: RedditComment | null,
  phrases: string[],
): string {
  if (comments.length === 0) {
    return "The thread is empty or comments are still gated. No room signal yet.";
  }

  const scores = comments.filter((comment) => comment.scoreKnown);
  const aboveZero = scores.filter((comment) => comment.score > 0).length;
  const atZero = scores.filter((comment) => comment.score === 0).length;
  const belowZero = scores.filter((comment) => comment.score < 0).length;
  const heat =
    comments.length > 400
      ? `A large discussion with ${comments.length} eligible comments.`
      : comments.length > 80
        ? `An active discussion with ${comments.length} eligible comments.`
        : `A focused discussion with ${comments.length} eligible comments.`;
  const scoreSummary =
    scores.length > 0
      ? ` Of ${scores.length} scored comments, ${aboveZero} are above zero, ${atZero} are at zero, and ${belowZero} are below zero.`
      : " Scores are unavailable.";
  const chorus = phrases[0]
    ? ` “${phrases[0]}” appears across at least three comments.`
    : "";
  const champ = mostUpvoted
    ? ` The highest-scoring comment is from u/${mostUpvoted.author} at ${mostUpvoted.score} points.`
    : "";
  return `${heat}${scoreSummary}${chorus}${champ}`;
}

export function rankHighlights(
  comments: RedditComment[],
): RedditReport["highlights"] {
  const live = comments.filter(usable);
  const scored = live.filter((comment) => comment.scoreKnown);
  const scoreRanked = [...scored].sort(compareScore);
  const topIds = new Set(
    scoreRanked.slice(0, 5).map((comment) => comment.id),
  );

  const mostUpvoted = pickFirst(scored, compareScore);
  const mostReplied = pickFirst(
    live.filter((comment) => comment.descendants > 0),
    compareDiscussion,
  );
  const longest = pickFirst(
    live.filter((comment) => commentWordCount(comment) > 0),
    (left, right) =>
      commentWordCount(right) - commentWordCount(left) ||
      readableCommentText(right.body).length -
        readableCommentText(left.body).length ||
      compareScore(left, right),
  );
  const mostAwarded = pickFirst(
    live.filter((comment) => comment.awards > 0),
    (left, right) =>
      right.awards - left.awards || compareScore(left, right),
  );
  const hiddenGem = pickFirst(
    scored.filter((comment) => !topIds.has(comment.id)),
    compareScore,
  );
  const bestOpReply = pickFirst(
    scored.filter(
      (comment) => comment.isOp && /^t1_/i.test(comment.parentId),
    ),
    compareScore,
  );
  const punchiest = pickFirst(
    scored.filter((comment) => {
      const words = commentWordCount(comment);
      const length = readableCommentText(comment.body).length;
      return comment.score > 0 && words >= 3 && words <= 24 && length <= 240;
    }),
    (left, right) =>
      right.score - left.score ||
      commentWordCount(left) - commentWordCount(right) ||
      compareDiscussion(left, right),
  );

  return {
    mostUpvoted: mostUpvoted ? toCard(mostUpvoted) : null,
    mostReplied: mostReplied ? toCard(mostReplied) : null,
    longest: longest ? toCard(longest) : null,
    mostAwarded: mostAwarded ? toCard(mostAwarded) : null,
    hiddenGem: hiddenGem ? toCard(hiddenGem) : null,
    bestOpReply: bestOpReply ? toCard(bestOpReply) : null,
    punchiest: punchiest ? toCard(punchiest) : null,
  };
}

export function mapRoom(
  _post: RedditPost,
  comments: RedditComment[],
): RedditReport["room"] {
  const live = comments.filter(usable);
  const scored = live.filter((comment) => comment.scoreKnown);
  const phrases = repeatingPhrases(live);
  const mostUpvoted = pickFirst(scored, compareScore);
  const questionCount = live.filter((comment) =>
    readableCommentText(comment.body).includes("?"),
  ).length;
  const linkCount = live.filter((comment) =>
    hasMeaningfulLink(comment.body),
  ).length;
  const deletedOrRemoved = comments.filter((comment) => {
    const body = comment.body.trim();
    return /^\[(?:deleted|removed)\]$/i.test(body);
  }).length;

  const scoreSplit = { positive: 0, zero: 0, negative: 0 };
  for (const comment of scored) {
    if (comment.score > 0) {
      scoreSplit.positive += 1;
    } else if (comment.score < 0) {
      scoreSplit.negative += 1;
    } else {
      scoreSplit.zero += 1;
    }
  }

  return {
    verdict: verdict(live, mostUpvoted, phrases),
    repeatingPhrases: phrases,
    questionCount,
    linkCount,
    deletedOrRemoved,
    scoreSplit,
    loudestCommenter: loudest(live),
  };
}

export function pickTopComments(comments: RedditComment[]): CommentCard[] {
  return comments
    .filter(usable)
    .filter((comment) => comment.scoreKnown)
    .sort(compareScore)
    .slice(0, 5)
    .map(toCard);
}

export function summarizeSample(
  comments: RedditComment[],
  listed = comments.length,
  complete = false,
): RedditReport["sample"] {
  const live = comments.filter(usable);
  const scores = live
    .filter((comment) => comment.scoreKnown)
    .map((comment) => comment.score);
  const authors = new Set(
    live
      .map((comment) => comment.author.toLowerCase())
      .filter((author) => author !== "[deleted]"),
  );
  return {
    commentsLoaded: comments.length,
    commentsAnalyzed: live.length,
    commentsListed: listed,
    complete,
    uniqueCommenters: authors.size,
    opReplies: live.filter(
      (comment) => comment.isOp && /^t1_/i.test(comment.parentId),
    ).length,
    maxDepth: live
      .filter((comment) => comment.depthKnown)
      .reduce((max, comment) => Math.max(max, comment.depth), 0),
    avgScore:
      scores.length === 0
        ? 0
        : Math.round(
            (scores.reduce((sum, value) => sum + value, 0) / scores.length) *
              10,
          ) / 10,
    medianScore: Math.round(median(scores) * 10) / 10,
  };
}

export function buildReport(
  post: RedditPost,
  comments: RedditComment[],
  complete = false,
): RedditReport {
  return {
    kind: "reddit",
    version: 2,
    generatedAt: new Date().toISOString(),
    post,
    sample: summarizeSample(comments, post.numComments, complete),
    highlights: rankHighlights(comments),
    topComments: pickTopComments(comments),
    room: mapRoom(post, comments),
  };
}
