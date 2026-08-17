import type { CommentCard, RedditReport } from "@/lib/report";
import { formatScore } from "@/lib/report";

function redditHref(permalink: string): string {
  return permalink.startsWith("http")
    ? permalink
    : `https://www.reddit.com${permalink}`;
}

function CommentBlock({
  label,
  comment,
}: {
  label: string;
  comment: CommentCard;
}) {
  return (
    <article className="card">
      <p className="kicker">{label}</p>
      <p className="meta">
        <span className="score">▲ {formatScore(comment.score)}</span>
        <span>u/{comment.author}</span>
        {comment.isOp ? <span className="op">OP</span> : null}
        {comment.replies > 0 ? <span>{comment.replies} replies</span> : null}
        {comment.awards > 0 ? <span>{comment.awards} awards</span> : null}
      </p>
      <p className="body">{comment.body}</p>
      <a href={redditHref(comment.permalink)} target="_blank" rel="noreferrer">
        Open on Reddit
      </a>
    </article>
  );
}

export function AuditReport({ report }: { report: RedditReport }) {
  const { post, sample, highlights, topComments, room } = report;
  const listed = sample.commentsListed ?? post.numComments;
  const complete =
    sample.complete ??
    (listed === 0 || sample.commentsLoaded >= listed * 0.9);
  const cards: Array<[string, CommentCard | null]> = [
    ["Most upvoted", highlights.mostUpvoted],
    ["Started the biggest reply pile", highlights.mostReplied],
    ["Punchiest take", highlights.punchiest],
    ["Hidden gem", highlights.hiddenGem],
    ["Longest comment", highlights.longest],
    ["Most awarded", highlights.mostAwarded],
    ["Best OP reply", highlights.bestOpReply],
  ];

  return (
    <section className="report">
      <header className="hero">
        <p className="kicker">
          r/{post.subreddit}
          {post.flair ? ` · ${post.flair}` : ""}
          {post.nsfw ? " · NSFW" : ""}
        </p>
        <h2>{post.title}</h2>
        <p className="meta">
          <span className="score">▲ {formatScore(post.score)}</span>
          <span>{Math.round(post.upvoteRatio * 100)}% up</span>
          <span>{formatScore(post.numComments)} comments</span>
          <span>u/{post.author}</span>
        </p>
        {post.selftext ? (
          <p className="body post-body">{post.selftext}</p>
        ) : null}
        <a href={redditHref(post.permalink)} target="_blank" rel="noreferrer">
          Open the thread
        </a>
      </header>

      <div className="stats">
        <div>
          <strong>{sample.commentsLoaded}</strong>
          <span>of {formatScore(listed)} read</span>
        </div>
        <div>
          <strong>{sample.uniqueCommenters}</strong>
          <span>voices</span>
        </div>
        <div>
          <strong>{sample.opReplies}</strong>
          <span>OP replies</span>
        </div>
        <div>
          <strong>{sample.maxDepth}</strong>
          <span>max depth</span>
        </div>
        <div>
          <strong>{sample.medianScore}</strong>
          <span>median score</span>
        </div>
        <div>
          <strong>{room.scoreSplit.negative}</strong>
          <span>downvoted</span>
        </div>
      </div>

      <p className="coverage">
        {complete
          ? `Read the full thread — ${sample.commentsLoaded} comments.`
          : `Read ${sample.commentsLoaded} of ${listed} comments. Rankings use this sample, not Reddit’s collapsed view.`}
      </p>

      <article className="card verdict">
        <p className="kicker">The room</p>
        <p className="body">{room.verdict}</p>
        {room.repeatingPhrases.length > 0 ? (
          <p className="phrases">
            Repeating phrases:{" "}
            {room.repeatingPhrases.map((phrase) => (
              <em key={phrase}>{phrase}</em>
            ))}
          </p>
        ) : null}
        <p className="meta">
          <span>{room.questionCount} questions</span>
          <span>{room.linkCount} comments with links</span>
          <span>{room.deletedOrRemoved} deleted/removed</span>
          {room.loudestCommenter ? (
            <span>
              Loudest: u/{room.loudestCommenter.author} (
              {room.loudestCommenter.comments} comments)
            </span>
          ) : null}
        </p>
      </article>

      <div className="grid">
        {cards.map(([label, comment]) =>
          comment ? (
            <CommentBlock key={label} label={label} comment={comment} />
          ) : null,
        )}
      </div>

      {topComments.length > 0 ? (
        <section>
          <p className="kicker">Top five by score</p>
          <ol className="top-list">
            {topComments.map((comment, index) => (
              <li key={comment.id}>
                <span className="rank">{index + 1}</span>
                <div>
                  <p className="meta">
                    <span className="score">
                      ▲ {formatScore(comment.score)}
                    </span>
                    <span>u/{comment.author}</span>
                  </p>
                  <p className="body">{comment.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </section>
  );
}
