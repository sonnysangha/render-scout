import assert from "node:assert/strict";
import test from "node:test";
import {
  commentsFromRows,
  fetchAllComments,
  type RedditPost,
} from "./reddit.js";

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
  permalink: "/r/test/comments/post/fixture",
  url: "https://reddit.com/r/test/comments/post/fixture",
  domain: "self.test",
  nsfw: false,
};

function row(
  id: string,
  parentId: string,
  createdUtc: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    parent_id: parentId,
    author: `author_${id}`,
    body: `Body for ${id}`,
    score: 1,
    created_utc: createdUtc,
    ...overrides,
  };
}

test("reconstructs shuffled trees, orphan subtrees, scores, awards, and OP identity", () => {
  const rows = [
    row("a", "t3_post", 10, {
      author: "ORIGINALPOSTER",
      total_awards_received: 2,
      gilded: 1,
    }),
    row("b", "t1_a", 20, { gilded: 1 }),
    row("c", "t1_b", 30, { score_hidden: true }),
    row("d", "t1_a", 25),
    row("orphan", "t1_missing", 40),
    row("orphan-child", "t1_orphan", 50),
    row("missing-parent", "", 55),
    row("cycle-x", "t1_cycle-y", 60),
    row("cycle-y", "t1_cycle-x", 70),
  ];

  for (const input of [rows, [...rows].reverse()]) {
    const comments = commentsFromRows(post, input);
    const byId = new Map(comments.map((item) => [item.id, item]));
    const a = byId.get("a");
    const b = byId.get("b");
    const c = byId.get("c");
    const orphan = byId.get("orphan");
    const orphanChild = byId.get("orphan-child");

    assert.equal(a?.directReplies, 2);
    assert.equal(a?.descendants, 3);
    assert.equal(a?.depth, 0);
    assert.equal(a?.depthKnown, true);
    assert.equal(a?.awards, 2);
    assert.equal(a?.isOp, true);
    assert.equal(a?.permalink, "/r/test/comments/post/fixture/a/");
    assert.equal(b?.directReplies, 1);
    assert.equal(b?.descendants, 1);
    assert.equal(b?.depth, 1);
    assert.equal(b?.awards, 1);
    assert.equal(c?.depth, 2);
    assert.equal(c?.scoreKnown, false);
    assert.equal(orphan?.directReplies, 1);
    assert.equal(orphan?.descendants, 1);
    assert.equal(orphan?.depthKnown, false);
    assert.equal(orphanChild?.depthKnown, false);
    assert.equal(byId.get("missing-parent")?.depthKnown, false);
    assert.equal(byId.get("cycle-x")?.depthKnown, false);
    assert.equal(byId.get("cycle-y")?.depthKnown, false);
  }
});

test("deduplicates snapshots using retrieval time instead of input order", () => {
  const oldRow = row("duplicate", "t3_post", 10, {
    score: 1,
    body: "old",
    retrieved_on: 1000,
  });
  const newRow = row("duplicate", "t3_post", 10, {
    score: 9,
    body: "new",
    retrieved_on: 2000,
  });

  for (const rows of [
    [oldRow, newRow],
    [newRow, oldRow],
  ]) {
    const [deduplicated] = commentsFromRows(post, rows);
    assert.equal(deduplicated?.score, 9);
    assert.equal(deduplicated?.body, "new");
  }
});

test("reports an exhausted multi-page fetch explicitly", async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) =>
    row(`page-a-${index}`, "t3_post", 1000),
  );
  const secondPage = [
    firstPage[99] as Record<string, unknown>,
    row("page-b", "t3_post", 1000),
  ];
  const afterValues: Array<number | null> = [];
  const pages = [firstPage, secondPage];

  const result = await fetchAllComments("post", async (_postId, after) => {
    afterValues.push(after);
    return pages.shift() ?? [];
  });

  assert.equal(result.rows.length, 101);
  assert.equal(result.complete, true);
  assert.equal(result.truncated, false);
  assert.deepEqual(afterValues, [null, 999]);
});

test("fails instead of publishing a silent partial page set", async () => {
  let calls = 0;
  await assert.rejects(
    fetchAllComments("post", async () => {
      calls += 1;
      if (calls === 1) {
        return Array.from({ length: 100 }, (_, index) =>
          row(`partial-${index}`, "t3_post", index),
        );
      }
      throw new Error("later page failed");
    }),
    /later page failed/,
  );
});

test("marks a saturated timestamp boundary incomplete instead of skipping it", async () => {
  const boundaryPage = Array.from({ length: 100 }, (_, index) =>
    row(`boundary-${index}`, "t3_post", 1000),
  );
  const pages = [boundaryPage, [...boundaryPage]];

  const result = await fetchAllComments(
    "post",
    async () => pages.shift() ?? [],
  );

  assert.equal(result.rows.length, 100);
  assert.equal(result.complete, false);
  assert.equal(result.truncated, true);
});

test("requires an alternate source before declaring an empty search complete", async () => {
  const result = await fetchAllComments("post", async () => []);
  assert.deepEqual(result, { rows: [], complete: false, truncated: false });
});

test("marks the 8,000-comment safety cap as truncated", async () => {
  const pages = [
    Array.from({ length: 4000 }, (_, index) =>
      row(`cap-a-${index}`, "t3_post", index),
    ),
    Array.from({ length: 4001 }, (_, index) =>
      row(`cap-b-${index}`, "t3_post", 4000 + index),
    ),
  ];

  const result = await fetchAllComments(
    "post",
    async () => pages.shift() ?? [],
  );
  assert.equal(result.rows.length, 8000);
  assert.equal(result.complete, false);
  assert.equal(result.truncated, true);
});
