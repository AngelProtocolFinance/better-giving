# blog

Sanity Studio backing the `better-giving` web app's `/blog`.

- projectId + dataset: hardcoded in three places that change together: `sanity.config.ts`,
  `sanity.cli.ts`, and `packages/types/blog/project.ts` (the copy the web app reads)
- manage: https://www.sanity.io/manage/project/5820hdyj

## Local

From the repo root:

```sh
pnpm install
pnpm --filter blog dev   # http://localhost:3333
```

## Deploy

### Vercel (studio host)

- Framework preset: **Other**
- Install: `pnpm install`
- Build: `pnpm build`
- Output dir: `dist`
- Env vars: none (projectId/dataset are hardcoded, see above)

After first deploy, add the Vercel URL as a CORS origin in [Sanity manage](https://www.sanity.io/manage/project/5820hdyj/api) so the studio can reach the Content Lake.

### Sanity-hosted (alternative)

Run from `main` only, after the schema change is merged:

```sh
pnpm --filter blog run studio:deploy   # publishes to <hostname>.sanity.studio
```
