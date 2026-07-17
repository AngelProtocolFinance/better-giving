# blog

Sanity Studio backing the `better-giving` web app's `/blog`.

- projectId: `5820hdyj`
- dataset: `production`
- manage: https://www.sanity.io/manage/project/5820hdyj

## Local

```sh
pnpm install
pnpm dev      # http://localhost:3333
```

## Deploy

### Vercel (studio host)

- Framework preset: **Other**
- Install: `pnpm install`
- Build: `pnpm build` (runs `sanity build`, outputs to `dist`)
- Output dir: `dist`
- Env vars: none (projectId/dataset hardcoded in `sanity.cli.ts`)

After first deploy, add the Vercel URL as a CORS origin in [Sanity manage](https://www.sanity.io/manage/project/5820hdyj/api) so the studio can reach the Content Lake.

### Sanity-hosted (alternative)

```sh
pnpm deploy   # publishes to <hostname>.sanity.studio
```
