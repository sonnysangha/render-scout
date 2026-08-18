# Draftroom

## Start here

1. [Create your Render account](https://dashboard.render.com/register?utm_source=youtube&utm_medium=other&utm_campaign=2026_partnership_sonny) using this link.
2. [Claim $50 in free Render credits](https://credits-portal-mmdm.onrender.com/claim/sonny-youtube) after creating your account.

Draftroom turns one YouTube idea into a ready-to-record script. A Render
Workflow runs four specialist agents in parallel, saves each brief to Postgres
as it arrives, then asks a final agent to assemble the script. The Next.js app
polls Postgres and reveals the work live.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://dashboard.render.com/blueprint/new?repo=https://github.com/sonnysangha/render-scout)

The button provisions the Web service, Postgres database, Key Value cache, and
cleanup cron. Render Workflows are created separately, so complete that short
step in [Render deployment](#render-deployment) before submitting a prompt.

## Architecture

| Render resource | Name | Responsibility |
| --- | --- | --- |
| Web service | `scout-web` | Prompt UI, run API, rate limiting, and `/health` |
| Postgres | `scout-db` | Run status, specialist briefs, and final scripts |
| Key Value | `draftroom-cache` | Five-minute cache for completed runs |
| Cron job | `draftroom-cleanup` | Deletes script runs older than seven days |
| Workflow | `draftroom` | Four parallel specialists and the final writer |

Postgres remains the source of truth. Key Value caches only completed runs for
five minutes, so live and failed runs are never stale. The cleanup cron runs
daily at 03:00 UTC and exits as soon as its single delete query completes.

The Vercel AI SDK is used as a Node.js library inside the Workflow. OpenAI is
the model provider. `OPENAI_API_KEY` belongs only to the Workflow; it is never
exposed to the browser or Web service.

## Prerequisites

- Node.js 22.9 or newer
- Docker Desktop for local Postgres and Valkey
- Render CLI 2.11 or newer
- An OpenAI API key
- A Render account for deployed runs

Check the Render CLI:

```bash
render --version
render whoami
```

## Local setup

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://dashboard.render.com/blueprint/new?repo=https://github.com/sonnysangha/render-scout)

Use the button for a hosted setup, or continue below to run Draftroom locally.

### 1. Start Postgres and Valkey

Compose runs Postgres 16 on `127.0.0.1:5433` and Valkey 8 on
`127.0.0.1:6380`. Both bind only to localhost. The alternate ports avoid
colliding with existing Postgres or Redis-compatible services.

```bash
docker compose up -d postgres cache
docker compose ps
```

### 2. Create the local environment files

The commands below do not overwrite files that already exist:

```bash
test -f web/.env.local || cp web/.env.example web/.env.local
test -f workflows/.env.local || cp workflows/.env.example workflows/.env.local
```

There is intentionally no root `.env.local`. `web` and `workflows` are
separate runtimes, so each directory owns only the variables it consumes.
Both `.env.local` files are ignored by Git.

### 3. Configure `web/.env.local`

```env
DATABASE_URL=postgres://draftroom:draftroom@127.0.0.1:5433/draftroom
REDIS_URL=redis://127.0.0.1:6380
RENDER_API_KEY=local
RENDER_USE_LOCAL_DEV=true
WORKFLOW_SLUG=draftroom
RATE_LIMIT_SECRET=
DRAFTROOM_DEMO=false
```

For local development, `RATE_LIMIT_SECRET` can remain empty because the app
uses a local-only fallback. To mirror production, generate and paste a secret:

```bash
openssl rand -hex 32
```

`RENDER_USE_LOCAL_DEV=true` makes the Render SDK call the local Workflow server
on port `8120`. Never set it on the deployed Web service.

### 4. Configure `workflows/.env.local`

```env
DATABASE_URL=postgres://draftroom:draftroom@127.0.0.1:5433/draftroom
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-5.6-luna
```

Replace `your_openai_key` with a real key. `OPENAI_MODEL` is optional; when it
is absent, Draftroom defaults to `gpt-5.6-luna`.

### 5. Install dependencies and migrate the database

```bash
cd web
npm ci
npm run migrate

cd ../workflows
npm ci
```

### 6. Run the Workflow and Web service

Keep both terminals running.

Terminal 1 — local Render Workflow server:

```bash
cd workflows
render workflows dev -- npm start
```

Terminal 2 — Next.js:

```bash
cd web
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Submitting a prompt uses
the local Workflow server and local Postgres, while the Workflow itself calls
OpenAI.

To confirm task registration while Terminal 1 is running:

```bash
render workflows tasks list --local --output json
```

It should list `writeYouTubeScript`, `runScriptSpecialist`, and
`assembleYouTubeScript`.

## Environment variables

### Web service

| Variable | Required | Local value | Render value | Purpose |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | Yes | Docker URL on port `5433` | Injected from `scout-db` by `render.yaml` | Postgres connection |
| `REDIS_URL` | No | Valkey URL on port `6380` | Injected from `draftroom-cache` | Caches completed runs for five minutes |
| `RENDER_API_KEY` | Yes | `local` | Secret Render API key | Lets the Web service start Workflow tasks |
| `RENDER_USE_LOCAL_DEV` | Local only | `true` | Leave unset | Routes the SDK to the local task server |
| `WORKFLOW_SLUG` | No | `draftroom` | `draftroom` | Prefix for `draftroom/writeYouTubeScript` |
| `RATE_LIMIT_SECRET` | Production | Optional locally | Random secret | Hashes request identity for the Postgres-backed rate limit |
| `DRAFTROOM_DEMO` | No | `false`; use `true` only for UI fixtures | Leave unset | Enables development-only `?demo=running` and `?demo=ready` states |

`NODE_ENV`, `PORT`, and other platform variables are managed by Next.js or
Render. They do not belong in `web/.env.local`.

### Workflow

| Variable | Required | Local value | Render value | Purpose |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | Yes | Docker URL on port `5433` | Internal URL from `scout-db` | Writes progress and the completed script |
| `OPENAI_API_KEY` | Yes | Your OpenAI key | Secret OpenAI key | Authenticates Vercel AI SDK requests |
| `OPENAI_MODEL` | No | `gpt-5.6-luna` | `gpt-5.6-luna` or another supported model | Selects the OpenAI model |

Do not commit either `.env.local` file and do not place `OPENAI_API_KEY` in the
Web service.

Draftroom also enforces a small global concurrency and hourly ceiling so a
public demo cannot create unbounded OpenAI usage. Set a separate project budget
limit in the OpenAI dashboard as the final billing safeguard.

## Render deployment

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://dashboard.render.com/blueprint/new?repo=https://github.com/sonnysangha/render-scout)

The Blueprint deploys `scout-web`, `scout-db`, `draftroom-cache`, and
`draftroom-cleanup`. Then create the `draftroom` Workflow using step 2 below.

### 1. Web, Postgres, Key Value, and cron

The Blueprint defines the Web service, Postgres, the internal-only Key Value
cache, and the daily cleanup cron:

```bash
render blueprints validate
```

Connect the repository as a Blueprint in the Render Dashboard. The Blueprint
automatically injects the database's internal connection string into
`scout-web` as `DATABASE_URL` and the cache's internal connection string as
`REDIS_URL`.

The free Key Value plan is non-persistent by design because every cached value
can be recreated from Postgres. Render cron jobs have a $1 monthly minimum;
viewer credits from step 2 at the top cover that demo resource.

Set these secrets on `scout-web` under **Environment**:

- `RENDER_API_KEY`: a real Render API key
- `RATE_LIMIT_SECRET`: output from `openssl rand -hex 32`

They use `sync: false` in `render.yaml`. Render prompts for them only when the
Blueprint first creates the service. For an existing service or later
Blueprint update, set them manually in the Dashboard and redeploy.

Do not add `RENDER_USE_LOCAL_DEV` to Render.

### 2. Workflow

Render Workflows are configured separately from `render.yaml`:

1. In the Render Dashboard, create or open the `draftroom` Workflow.
2. Use this repository and set **Root Directory** to `workflows`.
3. Set **Build Command** to `npm ci`.
4. Set **Start Command** to `npm start`.
5. Add these values under **Environment**:
   - `DATABASE_URL`: copy the **internal** connection string from
     `scout-db` → **Connect**.
   - `OPENAI_API_KEY`: your OpenAI key.
   - `OPENAI_MODEL`: `gpt-5.6-luna` unless you intentionally choose another
     supported model.
6. Deploy the Workflow and confirm that its three tasks register.

Never use the local `127.0.0.1:5433` database URL on Render. Render services in
the same workspace and region should use the internal Postgres URL.

## Verification

```bash
cd web
npm run migrate
npm run build
npx tsc --noEmit --incremental false

cd ../workflows
npm test
npm run typecheck
```

After deployment:

```bash
curl -fsS https://scout-web-21qg.onrender.com/health
```

The endpoint should return `ok`.

## Stopping local services

Stop Postgres and Valkey while keeping the Postgres volume and data:

```bash
docker compose stop postgres cache
```

`docker compose down` removes the container and network but keeps the database
volume. Avoid `docker compose down -v` unless you intentionally want to erase
the local database.
