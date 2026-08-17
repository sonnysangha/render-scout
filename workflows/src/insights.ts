import type { RedditComment, RedditPost } from "./reddit.js";

export type CommentCard = {
  id: string;
  author: string;
  body: string;
  score: number;
  depth: number;
  replies: number;
  awards: number;
  permalink: string;
  isOp: boolean;
};

export type RedditReport = {
  kind: "reddit";
  post: RedditPost;
  sample: {
    commentsLoaded: number;
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

function usable(comment: RedditComment): boolean {
  const author = comment.author.toLowerCase();
  const body = comment.body.trim();
  if (!body || body === "[deleted]" || body === "[removed]") {
    return false;
  }
  if (author === "[deleted]" || author === "automoderator") {
    return false;
  }
  return true;
}

function toCard(comment: RedditComment): CommentCard {
  return {
    id: comment.id,
    author: comment.author,
    body: comment.body.trim(),
    score: comment.score,
    depth: comment.depth,
    replies: comment.directReplies,
    awards: comment.awards,
    permalink: comment.permalink.startsWith("http")
      ? comment.permalink
      : `https://www.reddit.com${comment.permalink}`,
    isOp: comment.isOp,
  };
}

function pickMax(
  comments: RedditComment[],
  scoreOf: (comment: RedditComment) => number,
): RedditComment | null {
  let best: RedditComment | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const comment of comments) {
    const score = scoreOf(comment);
    if (score > bestScore) {
      best = comment;
      bestScore = score;
    }
  }
  return best;
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

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP.has(word));
}

function repeatingPhrases(comments: RedditComment[]): string[] {
  const counts = new Map<string, number>();
  const ranked = [...comments].sort((a, b) => b.score - a.score).slice(0, 40);

  for (const comment of ranked) {
    const words = tokens(comment.body);
    for (let i = 0; i < words.length - 1; i += 1) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([phrase]) => phrase);
}

function loudest(
  comments: RedditComment[],
): RedditReport["room"]["loudestCommenter"] {
  const byAuthor = new Map<string, { comments: number; totalScore: number }>();
  for (const comment of comments) {
    if (comment.isOp) {
      continue;
    }
    const current = byAuthor.get(comment.author) ?? {
      comments: 0,
      totalScore: 0,
    };
    current.comments += 1;
    current.totalScore += comment.score;
    byAuthor.set(comment.author, current);
  }

  let winner: RedditReport["room"]["loudestCommenter"] = null;
  for (const [author, stats] of byAuthor) {
    if (
      !winner ||
      stats.comments > winner.comments ||
      (stats.comments === winner.comments &&
        stats.totalScore > winner.totalScore)
    ) {
      winner = { author, ...stats };
    }
  }
  return winner && winner.comments >= 2 ? winner : null;
}

function verdict(
  post: RedditPost,
  comments: RedditComment[],
  mostUpvoted: RedditComment | null,
  phrases: string[],
): string {
  if (comments.length === 0) {
    return "The thread is empty or comments are still gated. No room signal yet.";
  }

  const scores = comments.map((comment) => comment.score);
  const avg = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const coverage =
    post.numComments > 0 && comments.length < post.numComments * 0.9
      ? ` Read ${comments.length} of ${post.numComments} comments.`
      : "";
  const heat =
    post.numComments > 400
      ? "This is a loud thread."
      : post.numComments > 80
        ? "The room showed up."
        : "A smaller room.";
  const tone =
    avg >= 20
      ? "Top replies are landing hard."
      : avg >= 5
        ? "Replies are mostly landing."
        : "Scores are mixed; people are arguing more than agreeing.";
  const chorus = phrases[0] ? ` People keep circling “${phrases[0]}”.` : "";
  const champ = mostUpvoted
    ? ` The most upvoted take is from u/${mostUpvoted.author} at ${mostUpvoted.score} points.`
    : "";
  return `${heat} ${tone}${chorus}${champ}${coverage}`;
}

export function rankHighlights(
  comments: RedditComment[],
): RedditReport["highlights"] {
  const live = comments.filter(usable);
  const topIds = new Set(
    [...live]
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((comment) => comment.id),
  );

  const mostUpvoted = pickMax(live, (comment) => comment.score);
  const mostReplied = pickMax(
    live,
    (comment) => comment.directReplies * 10 + comment.descendants,
  );
  const longest = pickMax(live, (comment) => comment.body.length);
  const mostAwarded = pickMax(
    live.filter((comment) => comment.awards > 0),
    (comment) => comment.awards,
  );
  const hiddenGem = pickMax(
    live.filter(
      (comment) =>
        !topIds.has(comment.id) &&
        comment.score >= 8 &&
        comment.body.length >= 80 &&
        comment.body.length <= 900,
    ),
    (comment) => comment.score,
  );
  const bestOpReply = pickMax(
    live.filter((comment) => comment.isOp),
    (comment) => comment.score,
  );
  const punchiest = pickMax(
    live.filter(
      (comment) => comment.body.length >= 12 && comment.body.length <= 180,
    ),
    (comment) => comment.score * (1 + comment.awards),
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
  post: RedditPost,
  comments: RedditComment[],
): RedditReport["room"] {
  const live = comments.filter(usable);
  const phrases = repeatingPhrases(live);
  const mostUpvoted = pickMax(live, (comment) => comment.score);
  const questionCount = live.filter((comment) =>
    comment.body.includes("?"),
  ).length;
  const linkCount = live.filter((comment) =>
    /https?:\/\//i.test(comment.body),
  ).length;
  const deletedOrRemoved = comments.filter((comment) => {
    const body = comment.body.trim();
    return (
      body === "[deleted]" ||
      body === "[removed]" ||
      comment.author === "[deleted]"
    );
  }).length;

  const scoreSplit = { positive: 0, zero: 0, negative: 0 };
  for (const comment of live) {
    if (comment.score > 0) {
      scoreSplit.positive += 1;
    } else if (comment.score < 0) {
      scoreSplit.negative += 1;
    } else {
      scoreSplit.zero += 1;
    }
  }

  return {
    verdict: verdict(post, live, mostUpvoted, phrases),
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
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(toCard);
}

export function summarizeSample(
  comments: RedditComment[],
  listed = comments.length,
): RedditReport["sample"] {
  const live = comments.filter(usable);
  const scores = live.map((comment) => comment.score);
  const authors = new Set(live.map((comment) => comment.author));
  return {
    commentsLoaded: comments.length,
    commentsListed: listed,
    complete: listed === 0 || comments.length >= listed * 0.9,
    uniqueCommenters: authors.size,
    opReplies: live.filter((comment) => comment.isOp).length,
    maxDepth: live.reduce((max, comment) => Math.max(max, comment.depth), 0),
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
): RedditReport {
  return {
    kind: "reddit",
    post,
    sample: summarizeSample(comments, post.numComments),
    highlights: rankHighlights(comments),
    topComments: pickTopComments(comments),
    room: mapRoom(post, comments),
  };
}
