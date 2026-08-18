# Draftroom Workflow

`writeYouTubeScript(runId, topic)` coordinates the run:

1. `runScriptSpecialist` executes research, hooks, outline, and audience branches in parallel.
2. Each branch writes its plain-text output to Postgres as soon as it finishes.
3. `assembleYouTubeScript` combines the four briefs and stores the final script.

The AI layer is one small Vercel AI SDK `generateText` boundary using OpenAI.
The root [README](../README.md#environment-variables) is the source of truth for
local and Render environment variables.

Run locally:

```bash
npm ci
npm test
npm run typecheck
render workflows dev -- npm start
```
