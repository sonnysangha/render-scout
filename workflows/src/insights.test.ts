import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanCommentBody,
  mapRoom,
  pickTopComments,
  rankHighlights,
  readableCommentText,
  summarizeSample,
} from "./insights.js";
import type { RedditComment, RedditPost } from "./reddit.js";

const post: RedditPost = {
  id: "post",
  title: "Fixture",
  subreddit: "test",
  author: "OriginalPoster",
  score: 10,
  upvoteRatio: 0.9,
  numComments: 10,
  createdUtc: 1,
  flair: null,
  selftext: "",
  permalink: "/r/test/comments/post/fixture/",
  url: "https://reddit.com/r/test/comments/post/fixture/",
  domain: "self.test",
  nsfw: false,
};

function comment(
  id: string,
  overrides: Partial<RedditComment> = {},
): RedditComment {
  return {
    id,
    author: `author_${id}`,
    body: "A useful fixture comment with enough readable words.",
    score: 1,
    scoreKnown: true,
    depth: 0,
    depthKnown: true,
    parentId: "t3_post",
    directReplies: 0,
    descendants: 0,
    awards: 0,
    controversiality: 0,
    isOp: false,
    createdUtc: 100,
    permalink: `/r/test/comments/post/fixture/${id}/`,
    ...overrides,
  };
}

function words(prefix: string, count: number): string {
  return Array.from({ length: count }, (_, index) => `${prefix}${index}`).join(
    " ",
  );
}

test("normalizes invisible trackers and Markdown before measuring comments", () => {
  const polluted = `I'm still a[](https://alb.reddit.com/cr?${"x".repeat(
    1600,
  )}) confused developer with a real question.`;

  assert.equal(cleanCommentBody(polluted).includes("alb.reddit.com"), false);
  assert.equal(readableCommentText(polluted).includes("alb.reddit.com"), false);
  assert.equal(readableCommentText(polluted).length < 100, true);
  assert.equal(
    cleanCommentBody("Read [the docs](https://example.com/path) now"),
    "Read the docs now",
  );
});

test("pins the corrected audit 6 longest and reply-pile winners", () => {
  const tracker = `I'm still at Next.js 14 ${words(
    "visible",
    52,
  )}[](https://alb.reddit.com/cr?${"x".repeat(1625)})`;
  const fixture = [
    comment("p3l8q5w", { body: tracker }),
    comment("p3ul87z", { body: words("documentation", 221) }),
    comment("p3ifui4", {
      score: 7,
      body: words("direct", 186),
      directReplies: 3,
      descendants: 3,
    }),
    comment("p3inqtf", {
      score: 23,
      body: words("roadmap", 16),
      directReplies: 2,
      descendants: 4,
    }),
  ];

  const highlights = rankHighlights(fixture);
  assert.equal(highlights.longest?.id, "p3ul87z");
  assert.equal(highlights.mostReplied?.id, "p3inqtf");
});

test("selects every highlight by its factual metric with deterministic ties", () => {
  const trackerBody = `short visible body [](https://alb.reddit.com/cr?${"x".repeat(
    1600,
  )}) with only eight actual words`;
  const fixture = [
    comment("highest", {
      score: 100,
      body: words("highest", 30),
      createdUtc: 10,
    }),
    comment("biggest", {
      score: 20,
      body: words("discussion", 12),
      directReplies: 2,
      descendants: 4,
      createdUtc: 20,
    }),
    comment("three-direct", {
      score: 10,
      body: words("direct", 12),
      directReplies: 3,
      descendants: 3,
      createdUtc: 30,
    }),
    comment("tracker", { score: 1, body: trackerBody, createdUtc: 40 }),
    comment("longest", {
      score: 5,
      body: words("long", 80),
      createdUtc: 50,
    }),
    comment("awarded", {
      score: 6,
      awards: 2,
      body: words("award", 30),
      createdUtc: 60,
    }),
    comment("op", {
      author: "originalposter",
      score: 8,
      isOp: true,
      parentId: "t1_highest",
      body: words("answer", 30),
      createdUtc: 70,
    }),
    comment("short", {
      score: 25,
      body: words("short", 10),
      createdUtc: 80,
    }),
  ];

  for (const input of [fixture, [...fixture].reverse()]) {
    const highlights = rankHighlights(input);
    assert.equal(highlights.mostUpvoted?.id, "highest");
    assert.equal(highlights.mostReplied?.id, "biggest");
    assert.equal(highlights.mostReplied?.replies, 4);
    assert.equal(highlights.mostReplied?.directReplies, 2);
    assert.equal(highlights.longest?.id, "longest");
    assert.equal(highlights.longest?.wordCount, 80);
    assert.equal(highlights.mostAwarded?.id, "awarded");
    assert.equal(highlights.bestOpReply?.id, "op");
    assert.equal(highlights.punchiest?.id, "short");
    assert.equal(highlights.hiddenGem?.id, "awarded");
    assert.deepEqual(
      pickTopComments(input).map((item) => item.id),
      ["highest", "short", "biggest", "three-direct", "op"],
    );
  }
});

test("room signals use human-visible text and distinct comments", () => {
  const fixture = [
    comment("phrase-a", {
      author: "Alpha",
      score: 5,
      body: "Cache invalidation matters? Server actions server actions server actions.",
    }),
    comment("phrase-b", {
      author: "Bravo",
      score: 4,
      body: "Cache invalidation remains tricky.",
    }),
    comment("phrase-c", {
      author: "Charlie",
      score: 3,
      body: "We need cache invalidation now.",
    }),
    comment("tracker", {
      author: "Delta",
      body: `No question here[](https://alb.reddit.com/cr?${"q".repeat(300)})`,
    }),
    comment("markdown-link", {
      author: "Echo",
      body: "Read [the docs](https://example.com/path?source=test) today.",
    }),
    comment("bare-link", {
      author: "Foxtrot",
      body: "See https://example.org/path?source=test for details.",
    }),
    comment("relative-link", {
      author: "Golf",
      body: "Read [this thread](/r/test/comments/post/fixture/) too.",
    }),
    comment("www-link", {
      author: "India",
      body: "The reference is at WWW.Example.net/guide?source=test.",
    }),
    comment("deleted-author", {
      author: "[deleted]",
      body: "Can this useful answer still work?",
    }),
    comment("unknown-score", {
      author: "Hotel",
      score: 0,
      scoreKnown: false,
      body: "A useful comment whose score is hidden.",
    }),
    comment("bot", {
      author: "timee_bot",
      score: 100,
      body: "Timezone https://example.com/?tl=123",
    }),
    comment("suffix-bot", {
      author: "RemindMeBot",
      score: 200,
      body: "A bot should never enter the human-facing signal pool.",
    }),
    comment("removed", { author: "[deleted]", body: "[removed]" }),
  ];

  const room = mapRoom(post, fixture);
  assert.deepEqual(room.repeatingPhrases, ["cache invalidation"]);
  assert.equal(room.questionCount, 2);
  assert.equal(room.linkCount, 4);
  assert.equal(room.deletedOrRemoved, 1);
  assert.deepEqual(room.scoreSplit, { positive: 9, zero: 0, negative: 0 });
  assert.equal(room.verdict.includes("arguing"), false);
  assert.equal(room.verdict.includes("9 are above zero"), true);

  const sample = summarizeSample(fixture, 4, true);
  assert.equal(sample.commentsLoaded, 13);
  assert.equal(sample.commentsAnalyzed, 10);
  assert.equal(sample.uniqueCommenters, 9);
  assert.equal(sample.complete, true);
});

test("finds phrases across the full thread rather than only the score leaders", () => {
  const scoreLeaders = Array.from({ length: 40 }, (_, index) =>
    comment(`leader-${index}`, {
      author: `Leader${index}`,
      score: 100 - index,
      body: `Unique leader wording ${index}`,
      createdUtc: index,
    }),
  );
  const lowerScored = [
    comment("low-a", {
      author: "Alpha",
      score: -1,
      body: "Progressive enhancement still matters.",
      createdUtc: 100,
    }),
    comment("low-b", {
      author: "Bravo",
      score: -2,
      body: "Progressive enhancement improves resilience.",
      createdUtc: 101,
    }),
    comment("low-c", {
      author: "Charlie",
      score: -3,
      body: "Teams should keep progressive enhancement.",
      createdUtc: 102,
    }),
  ];

  assert.equal(
    mapRoom(post, [...scoreLeaders, ...lowerScored]).repeatingPhrases.includes(
      "progressive enhancement",
    ),
    true,
  );
});

test("keeps phrase words adjacent and does not bridge across stop words", () => {
  const fixture = [
    comment("bridge-a", {
      author: "Alpha",
      body: "Cache and invalidation are separate concerns.",
    }),
    comment("bridge-b", {
      author: "Bravo",
      body: "Cache or invalidation can break a release.",
    }),
    comment("bridge-c", {
      author: "Charlie",
      body: "Cache with invalidation needs careful testing.",
    }),
  ];

  assert.equal(
    mapRoom(post, fixture).repeatingPhrases.includes("cache invalidation"),
    false,
  );
});

test("does not bridge repeated phrases across removed URLs or code blocks", () => {
  const fixture = [
    comment("url-bridge-a", {
      author: "Alpha",
      body: "Cache https://example.com/one invalidation needs care.",
    }),
    comment("url-bridge-b", {
      author: "Bravo",
      body: "Cache WWW.Example.com/two invalidation needs testing.",
    }),
    comment("code-bridge", {
      author: "Charlie",
      body: "Cache ```ts\nconst stale = true;\n``` invalidation needs docs.",
    }),
  ];

  assert.equal(
    mapRoom(post, fixture).repeatingPhrases.includes("cache invalidation"),
    false,
  );
});

test("keeps URL-only and code-only comments eligible for factual signals", () => {
  const fixture = [
    comment("url-only", {
      author: "Linker",
      score: 100,
      body: "https://example.com/reference",
    }),
    comment("code-only", {
      author: "Coder",
      score: 50,
      body: "```ts\nconst answer = 42;\n```",
    }),
    comment("prose", {
      author: "Writer",
      score: 1,
      body: "This ordinary prose remains the longest readable comment here.",
    }),
    comment("tracker-only", {
      author: "Tracker",
      score: 500,
      body: `[](https://alb.reddit.com/cr?${"x".repeat(300)})`,
    }),
  ];

  const highlights = rankHighlights(fixture);
  assert.equal(highlights.mostUpvoted?.id, "url-only");
  assert.equal(highlights.longest?.id, "prose");
  assert.equal(mapRoom(post, fixture).linkCount, 1);
  assert.equal(summarizeSample(fixture).commentsAnalyzed, 3);
});
