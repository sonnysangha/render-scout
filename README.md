# Scout

Demo app for the Render influencer brief. Paste a URL. A Render Workflow crawls it, fans out page analysis, retries failed fetches, and writes a report to Postgres. The web service and cron job live in one Blueprint. The Workflow is created in the Dashboard — Blueprints do not support Workflows yet.

## What Render runs

| Resource    | Name          | Role                                                       |
| ----------- | ------------- | ---------------------------------------------------------- |
| Web service | `scout-web`   | Next.js app, `/health`, starts `startAudit`                |
| Postgres    | `scout-db`    | Audit rows and reports                                     |
| Key Value   | `scout-cache` | Live audit JSON for polling                                |
| Workflow    | `scout`       | `startAudit` → `crawlSite` + `analyzePage` → `writeReport` |

Private networking is the default: `DATABASE_URL` and `REDIS_URL` are internal connection strings from the Blueprint.

## Deploy

1. Push this repo to GitHub, GitLab, or Bitbucket.
2. Validate the Blueprint:

   ```bash
   render whoami -o json
   render blueprints validate
   ```

3. Apply the Blueprint: [dashboard.render.com/blueprint/new](https://dashboard.render.com/blueprint/new) and point it at the repo. Set `RENDER_API_KEY` when prompted (`sync: false`).
4. Create the Workflow in the Dashboard: **New → Workflow**.

   | Field          | Value                                |
   | -------------- | ------------------------------------ |
   | Name           | `scout` (must match `WORKFLOW_SLUG`) |
   | Root Directory | `workflows`                          |
   | Language       | Node                                 |
   | Build command  | `npm install`                        |
   | Start command  | `npm start`                          |

   Add `DATABASE_URL` and `REDIS_URL` from the Connect tabs on `scout-db` and `scout-cache` (internal URLs).

   Or with the CLI:

   ```bash
   render workflows create \
     --name scout \
     --runtime node \
     --root-directory workflows \
     --build-command "npm install" \
     --run-command "npm start" \
     --repo <your-repo-url>
   ```

   Then set `DATABASE_URL` and `REDIS_URL` on the Workflow (internal URLs).

5. Open the `scout-web` URL. Submit `https://render.com`. The page polls `/api/audits/:id` every 2 seconds.

## Local Workflows

Official hello-world tasks do not need a database:

```bash
cd workflows
render workflows dev -- npm start
```

In another terminal:

```bash
render workflows tasks start calculateSquare --local --input='[5]'
render workflows tasks start flipCoin --local --input='[]'
```

`startAudit` needs `DATABASE_URL` and `REDIS_URL` (external URLs, `sslmode=require` on Postgres).

## Notes

- Next.js starts with `next start -H 0.0.0.0` so it binds `0.0.0.0:$PORT`. Health check is `GET /health`.
- Do not put the Workflow in `render.yaml`.
- Services use the free plan. Free web services spin down after 15 minutes of inactivity. `preDeployCommand` is paid-only, so migrations run in the start command.
- Cron jobs have no free plan, so they are not in this Blueprint. `web/scripts/cron.ts` is there if you add a paid cron later.
