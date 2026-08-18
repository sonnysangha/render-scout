export type CommentCard = {
  id: string;
  author: string;
  body: string;
  score: number;
  scoreKnown?: boolean;
  depth: number;
  replies: number;
  directReplies?: number;
  awards: number;
  wordCount?: number;
  permalink: string;
  isOp: boolean;
};

export type RedditReport = {
  kind: "reddit";
  version?: number;
  generatedAt?: string;
  post: {
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
  sample: {
    commentsLoaded: number;
    commentsAnalyzed?: number;
    commentsListed?: number;
    complete?: boolean;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function asRedditReport(value: unknown): RedditReport | null {
  if (!isRecord(value) || value.kind !== "reddit" || !isRecord(value.post)) {
    return null;
  }
  return value as RedditReport;
}

export function reportError(value: unknown): string | null {
  if (isRecord(value) && typeof value.error === "string") {
    return value.error;
  }
  return null;
}

export function formatScore(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 10000) {
    return `${Math.round(value / 1000)}k`;
  }
  if (abs >= 1000) {
    return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(value);
}
