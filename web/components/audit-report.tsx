import type { CommentCard, RedditReport } from "@/lib/report";
import { formatScore } from "@/lib/report";

function redditHref(permalink: string): string {
  return permalink.startsWith("http")
    ? permalink
    : `https://www.reddit.com${permalink}`;
}

function cleanRedditText(body: string): string {
  return body
    .replace(/!\[([^\]]*)\]\(https?:\/\/[^)\s]+\)/g, "$1")
    .replace(/\[\]\(https?:\/\/alb\.reddit\.com\/cr\?[^)\s]+\)/g, "")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)\s]+\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function CommentCopy({ body }: { body: string }) {
  const cleaned = cleanRedditText(body);

  if (cleaned.length <= 620) {
    return <p className="body comment-body">{cleaned}</p>;
  }

  return (
    <details className="comment-details">
      <summary>
        <span className="body comment-body">{cleaned}</span>
        <span className="expand-copy expand-copy--closed">Read full comment</span>
        <span className="expand-copy expand-copy--open">Collapse comment</span>
      </summary>
    </details>
  );
}

function CommentBlock({
  labels,
  comment,
  index,
  isV2,
}: {
  labels: string[];
  comment: CommentCard;
  index: number;
  isV2: boolean;
}) {
  return (
    <article className="comment-card">
      <header className="comment-card__header">
        <div>
          <p className="eyebrow">
            {isV2
              ? labels.length > 1
                ? "Standout signals"
                : "Standout signal"
              : labels.length > 1
                ? "Saved signals"
                : "Saved signal"}
          </p>
          <h4>{labels.join(" · ")}</h4>
        </div>
        <span className="signal-index" aria-hidden="true">
          {String(index + 1).padStart(2, "0")}
        </span>
      </header>
      <p className="meta comment-meta">
        {comment.scoreKnown === false ? null : (
          <span className="score-pill">↑ {formatScore(comment.score)}</span>
        )}
        <span>u/{comment.author}</span>
        {comment.isOp ? <span className="op">OP</span> : null}
        {comment.wordCount !== undefined ? (
          <span>{comment.wordCount} words</span>
        ) : null}
        {isV2 && comment.replies > 0 ? (
          <span>{comment.replies} total replies</span>
        ) : null}
        {isV2 &&
        comment.directReplies !== undefined &&
        comment.directReplies > 0 &&
        comment.directReplies !== comment.replies ? (
          <span>{comment.directReplies} direct</span>
        ) : null}
        {!isV2 && comment.replies > 0 ? (
          <span>{comment.replies} direct replies</span>
        ) : null}
        {comment.awards > 0 ? <span>{comment.awards} awards</span> : null}
      </p>
      <CommentCopy body={comment.body} />
      <footer className="comment-card__footer">
        <a
          className="text-link"
          href={redditHref(comment.permalink)}
          target="_blank"
          rel="noreferrer"
        >
          View comment <span aria-hidden="true">↗</span>
        </a>
      </footer>
    </article>
  );
}

export function AuditReport({ report }: { report: RedditReport }) {
  const { post, sample, highlights, topComments, room } = report;
  const isV2 = report.version === 2;
  const hasAnalyzedCount = sample.commentsAnalyzed !== undefined;
  const analyzed = sample.commentsAnalyzed ?? sample.commentsLoaded;
  const listed = sample.commentsListed ?? post.numComments;
  const complete = isV2 ? (sample.complete ?? false) : false;
  const showListedTotal = listed > sample.commentsLoaded;
  const coverageSummary = hasAnalyzedCount
    ? `${sample.commentsLoaded} records fetched; ${analyzed} responses were eligible after filtering bots and tombstones.`
    : `${sample.commentsLoaded} records are stored in this earlier report.`;
  const cardCandidates: Array<[string, CommentCard | null]> = isV2
    ? [
        ["Highest score", highlights.mostUpvoted],
        ["Biggest reply pile", highlights.mostReplied],
        ["Top short comment", highlights.punchiest],
        ["Best beyond the top five", highlights.hiddenGem],
        ["Longest readable comment", highlights.longest],
        ["Most awarded", highlights.mostAwarded],
        ["Top OP reply", highlights.bestOpReply],
      ]
    : [
        ["Most upvoted", highlights.mostUpvoted],
        ["Started biggest reply pile", highlights.mostReplied],
        ["Punchiest take", highlights.punchiest],
        ["Hidden gem", highlights.hiddenGem],
        ["Longest comment", highlights.longest],
        ["Most awarded", highlights.mostAwarded],
        ["Best OP reply", highlights.bestOpReply],
      ];
  const cards = cardCandidates
    .filter((card): card is [string, CommentCard] => card[1] !== null)
    .reduce<Array<{ labels: string[]; comment: CommentCard }>>(
      (groups, [label, comment]) => {
        const existing = groups.find((group) => group.comment.id === comment.id);
        if (existing) {
          existing.labels.push(label);
        } else {
          groups.push({ labels: [label], comment });
        }
        return groups;
      },
      [],
    );
  const scoreTotal =
    room.scoreSplit.positive + room.scoreSplit.zero + room.scoreSplit.negative;
  const scoreDenominator = Math.max(1, scoreTotal);
  const scoreRows = [
    {
      label: "Above zero",
      value: room.scoreSplit.positive,
      className: "is-positive",
    },
    { label: "Zero", value: room.scoreSplit.zero, className: "is-neutral" },
    {
      label: "Below zero",
      value: room.scoreSplit.negative,
      className: "is-negative",
    },
  ];
  const postDate = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(post.createdUtc * 1000));
  const analyzedTimestamp = report.generatedAt
    ? Date.parse(report.generatedAt)
    : Number.NaN;
  const analyzedDate = Number.isNaN(analyzedTimestamp)
    ? null
    : new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
        timeZoneName: "short",
      }).format(new Date(analyzedTimestamp));

  return (
    <section className="report" aria-label="Reddit thread analysis">
      <header className="report-hero">
        <div className="report-hero__topline">
          <p className="analysis-state">
            <span aria-hidden="true" /> Analysis complete
          </p>
          <a
            className="hero-link"
            href={redditHref(post.permalink)}
            target="_blank"
            rel="noreferrer"
          >
            Open original thread <span aria-hidden="true">↗</span>
          </a>
        </div>
        <div className="post-tags">
          <span className="subreddit-tag">r/{post.subreddit}</span>
          {post.flair ? <span>{post.flair}</span> : null}
          {post.nsfw ? <span className="is-nsfw">NSFW</span> : null}
        </div>
        <h2>{post.title}</h2>
        <p className="post-byline">
          Posted by u/{post.author} <span aria-hidden="true">·</span> {postDate}
          {analyzedDate ? (
            <>
              {" "}
              <span aria-hidden="true">·</span> Analyzed {analyzedDate}
            </>
          ) : null}
        </p>
        <div className="post-signal-row" aria-label="Original post statistics">
          <span>
            <strong>{formatScore(post.score)}</strong> karma
          </span>
          <span>
            <strong>{Math.round(post.upvoteRatio * 100)}%</strong> upvoted
          </span>
          <span>
            <strong>{formatScore(post.numComments)}</strong> reported replies
          </span>
        </div>
        {post.selftext ? (
          <details className="post-context">
            <summary>
              Original post context <span aria-hidden="true">+</span>
            </summary>
            <p className="body post-body">{cleanRedditText(post.selftext)}</p>
          </details>
        ) : null}
      </header>

      <section className="report-section snapshot" aria-labelledby="snapshot-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Conversation map</p>
            <h3 id="snapshot-heading">Thread at a glance</h3>
          </div>
          <p>What Scout found across the available discussion.</p>
        </div>
        <div className="snapshot-grid">
          <div className="metric">
            <strong>{analyzed}</strong>
            <span>
              {hasAnalyzedCount
                ? "Eligible responses analyzed"
                : "Responses in saved report"}
            </span>
          </div>
          <div className="metric">
            <strong>{isV2 ? sample.uniqueCommenters : "—"}</strong>
            <span>{isV2 ? "Contributors" : "Contributor signal unavailable"}</span>
          </div>
          <div className="metric">
            <strong>{isV2 ? room.questionCount : "—"}</strong>
            <span>
              {isV2 ? "Comments with questions" : "Question signal unavailable"}
            </span>
          </div>
          <div className="metric">
            <strong>{isV2 ? sample.opReplies : "—"}</strong>
            <span>{isV2 ? "OP replies" : "OP signal unavailable"}</span>
          </div>
          <div className="metric">
            <strong>{isV2 ? sample.maxDepth : "—"}</strong>
            <span>{isV2 ? "Reply depth" : "Depth signal unavailable"}</span>
          </div>
          <div className="metric">
            <strong>{isV2 ? sample.medianScore : "—"}</strong>
            <span>{isV2 ? "Median score" : "Score signal unavailable"}</span>
          </div>
        </div>
        <div className={`coverage-card${complete ? " is-complete" : ""}`}>
          <span className="coverage-icon" aria-hidden="true">
            {complete ? "✓" : "↗"}
          </span>
          <div>
            <strong>{complete ? "Full-thread coverage" : "Sampled coverage"}</strong>
            <p>
              {complete
                ? coverageSummary
                : showListedTotal
                  ? `${sample.commentsLoaded} of ${listed} reported responses were fetched. ${coverageSummary} Rankings use this sample.`
                  : `${coverageSummary} Rankings use this sample.`}
            </p>
          </div>
        </div>
      </section>

      <section className="report-section room-section" aria-labelledby="room-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              {isV2 ? "Room data" : "Saved room analysis"}
            </p>
            <h3 id="room-heading">
              {isV2 ? "What the discussion shows" : "Earlier report summary"}
            </h3>
          </div>
        </div>
        {isV2 ? (
          <div className="room-card">
            <div className="room-copy">
              <p className="room-verdict">{room.verdict}</p>
              {room.repeatingPhrases.length > 0 ? (
                <div className="phrases">
                  <span>Repeated phrases</span>
                  <ul>
                    {room.repeatingPhrases.map((phrase) => (
                      <li key={phrase}>{phrase}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <ul className="room-facts">
                <li>
                  <strong>{room.linkCount}</strong> comments shared links
                </li>
                <li>
                  <strong>{room.deletedOrRemoved}</strong> deleted or removed
                </li>
                {room.loudestCommenter ? (
                  <li>
                    <strong>u/{room.loudestCommenter.author}</strong> was the most
                    active
                  </li>
                ) : null}
              </ul>
            </div>
            <div className="score-distribution">
              <div className="score-distribution__header">
                <span>Score distribution</span>
                <span>{scoreTotal} scored</span>
              </div>
              <div className="score-bars">
                {scoreRows.map((row) => (
                  <div className="score-row" key={row.label}>
                    <div>
                      <span>{row.label}</span>
                      <strong>{row.value}</strong>
                    </div>
                    <span className="score-track" aria-hidden="true">
                      <span
                        className={row.className}
                        style={{
                          width:
                            row.value === 0
                              ? 0
                              : `max(2px, ${(row.value / scoreDenominator) * 100}%)`,
                        }}
                      />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="coverage-card">
            <span className="coverage-icon" aria-hidden="true">
              ↗
            </span>
            <div>
              <strong>Re-run this thread for corrected room signals</strong>
              <p>
                This saved report used the earlier analysis model, so its phrase,
                question, link, and score summaries are intentionally hidden.
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="report-section" aria-labelledby="highlights-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              {isV2 ? "Standout replies" : "Saved standouts"}
            </p>
            <h3 id="highlights-heading">
              {isV2 ? "Comments that moved the room" : "Earlier-model highlights"}
            </h3>
          </div>
          <p>
            {isV2
              ? "Ranked by factual thread signals."
              : "Re-run the thread to replace these saved legacy rankings."}
          </p>
        </div>
        <div className="highlight-grid">
          {cards.map(({ labels, comment }, index) => (
            <CommentBlock
              key={comment.id}
              labels={labels}
              comment={comment}
              index={index}
              isV2={isV2}
            />
          ))}
        </div>
      </section>

      {topComments.length > 0 ? (
        <section className="report-section" aria-labelledby="ranking-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                {isV2 ? "Leaderboard" : "Saved leaderboard"}
              </p>
              <h3 id="ranking-heading">
                {isV2 ? "Top comments by score" : "Earlier-model score ranking"}
              </h3>
            </div>
            <p>
              {isV2
                ? "The replies the community lifted to the top."
                : "This ranking is saved from the earlier model; re-run the thread to replace it."}
            </p>
          </div>
          <ol className="top-list">
            {topComments.map((comment, index) => (
              <li key={comment.id}>
                <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                <div className="ranked-comment">
                  <div className="ranked-comment__topline">
                    <span>u/{comment.author}</span>
                    {comment.isOp ? <span className="op">OP</span> : null}
                  </div>
                  <CommentCopy body={comment.body} />
                  <a
                    className="text-link"
                    href={redditHref(comment.permalink)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on Reddit <span aria-hidden="true">↗</span>
                  </a>
                </div>
                <span className="rank-score">↑ {formatScore(comment.score)}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </section>
  );
}
