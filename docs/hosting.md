# Hosting

The app is static files: `pnpm build` writes them to `apps/web/dist`, and Supabase is the
only backend. It is served by Cloudflare as a Worker with static assets (no server code).

Live: <https://van-build.holor-reception.workers.dev>

## Deploying

```bash
pnpm release
```

That builds the app and runs `wrangler deploy` with `apps/web/wrangler.jsonc`. Wrangler needs
to be signed in to the Cloudflare account once (`pnpm --filter @vanbuild/web exec wrangler login`).

The build reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from
`apps/web/.env.local` (or the environment). Without them the deployed app has no accounts.

## Cache rules

`apps/web/public/_headers` sets them, and the offline mode depends on them:

| Path                                                  | Cache                                           |
| ----------------------------------------------------- | ----------------------------------------------- |
| `/assets/*`                                           | One year, immutable: names carry a content hash |
| `/`, `/index.html`, `/sw.js`, `/manifest.webmanifest` | `no-cache`: always check for a new release      |

A new release reaches people on their next visit; the service worker swaps in once every tab
of the old version is closed.

## When the address changes

Add the new address to Supabase (Authentication, URL Configuration): set it as the Site URL
and add it to the Redirect URLs, or sign-in links will not come back to the app.
