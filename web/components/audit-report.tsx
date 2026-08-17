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
  label,
  comment,
  index,
}: {
  label: string;
  comment: CommentCard;
  index: number;
}) {
  return (
    <article className="comment-card">
      <header className="comment-card__header">
        <div>
          <p className="eyebrow">Standout signal</p>
          <h4>{label}</h4>
        </div>
        <span className="signal-index" aria-hidden="true">
          {String(index + 1).padStart(2, "0")}
        </span>
      </header>
      <p className="meta comment-meta">
        <span className="score-pill">↑ {formatScore(comment.score)}</span>
        <span>u/{comment.author}</span>
        {comment.isOp ? <span className="op">OP</span> : null}
        {comment.replies > 0 ? <span>{comment.replies} replies</span> : null}
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
  const listed = sample.commentsListed ?? post.numComments;
  const complete =
    sample.complete ?? (listed === 0 || sample.commentsLoaded >= listed * 0.9);
  const showListedTotal = listed > sample.commentsLoaded;
  const cardCandidates: Array<[string, CommentCard | null]> = [
    ["Most upvoted", highlights.mostUpvoted],
    ["Started the biggest reply pile", highlights.mostReplied],
    ["Punchiest take", highlights.punchiest],
    ["Hidden gem", highlights.hiddenGem],
    ["Longest comment", highlights.longest],
    ["Most awarded", highlights.mostAwarded],
    ["Best OP reply", highlights.bestOpReply],
  ];
  const cards = cardCandidates.filter(
    (card): card is [string, CommentCard] => card[1] !== null,
  );
  const scoreTotal = Math.max(
    1,
    room.scoreSplit.positive + room.scoreSplit.zero + room.scoreSplit.negative,
  );
  const scoreRows = [
    {
      label: "Positive",
      value: room.scoreSplit.positive,
      className: "is-positive",
    },
    { label: "Neutral", value: room.scoreSplit.zero, className: "is-neutral" },
    {
      label: "Negative",
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
        </p>
        <div className="post-signal-row" aria-label="Original post statistics">
          <span>
            <strong>{formatScore(post.score)}</strong> karma
          </span>
          <span>
            <strong>{Math.round(post.upvoteRatio * 100)}%</strong> upvoted
          </span>
          <span>
            <strong>{formatScore(post.numComments)}</strong> listed replies
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
            <strong>{sample.commentsLoaded}</strong>
            <span>Responses analyzed</span>
          </div>
          <div className="metric">
            <strong>{sample.uniqueCommenters}</strong>
            <span>Contributors</span>
          </div>
          <div className="metric">
            <strong>{room.questionCount}</strong>
            <span>Questions</span>
          </div>
          <div className="metric">
            <strong>{sample.opReplies}</strong>
            <span>OP replies</span>
          </div>
          <div className="metric">
            <strong>{sample.maxDepth}</strong>
            <span>Reply depth</span>
          </div>
          <div className="metric">
            <strong>{sample.medianScore}</strong>
            <span>Median score</span>
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
                ? `${sample.commentsLoaded} available responses analyzed.`
                : showListedTotal
                  ? `${sample.commentsLoaded} of ${listed} listed responses analyzed. Rankings use this sample.`
                  : `${sample.commentsLoaded} available responses analyzed. Rankings use this sample.`}
            </p>
          </div>
        </div>
      </section>

      <section className="report-section room-section" aria-labelledby="room-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Room signal</p>
            <h3 id="room-heading">What the conversation feels like</h3>
          </div>
        </div>
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
                  <strong>u/{room.loudestCommenter.author}</strong> was the most active
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
                            : `max(2px, ${(row.value / scoreTotal) * 100}%)`,
                      }}
                    />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="report-section" aria-labelledby="highlights-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Standout replies</p>
            <h3 id="highlights-heading">Comments that moved the room</h3>
          </div>
          <p>Ranked by attention, reaction, and conversational impact.</p>
        </div>
        <div className="highlight-grid">
          {cards.map(([label, comment], index) => (
            <CommentBlock
              key={label}
              label={label}
              comment={comment}
              index={index}
            />
          ))}
        </div>
      </section>

      {topComments.length > 0 ? (
        <section className="report-section" aria-labelledby="ranking-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Leaderboard</p>
              <h3 id="ranking-heading">Top comments by score</h3>
            </div>
            <p>The replies the community lifted to the top.</p>
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
