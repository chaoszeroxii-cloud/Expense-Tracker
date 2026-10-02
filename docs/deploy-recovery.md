# Lazy-route failures after deployment

## Observed on 2026-09-30

The reported production URL `/assets/AuthPage-BORrRRng.js` returned 404. The current
HTML loaded `/assets/index-PhyIn0q-.js`, which referenced `AuthPage-D3I2W1bY.js` (200,
JavaScript). This establishes a stale client reference, rather than a missing current
Login bundle. Direct `/login` also returned 404; the frontend had no Vercel SPA rewrite.
These were unauthenticated HTTP checks, not an inspection of the user's browser cache.

The worker served every navigation from its precached HTML. Only the shell was
precached, and no runtime route actually cached lazy JS/CSS despite the Vite comment.
An old shell could therefore request an unvisited lazy file removed by deployment.
The error boundary only offered plain reload, which could serve the same old shell,
and suggested environment configuration without evidence.

## Repair

- Online navigation revalidates `/index.html`, with a four-second timeout and the
  installed shell as offline fallback. Navigation is registered before precache
  routing so `/` and `/index.html` also get fresh HTML. API and asset paths bypass it.
- Visited same-origin hash-named JS/CSS use a bounded public code cache (80 entries,
  30 days). Authenticated API data stays outside shared caches.
- A recognized lazy-module/CSS loading error tries a worker update, waits at most
  six seconds, then reloads the same URL. Session storage permits one automatic
  attempt per release per tab. Offline or blocked storage prevents automatic retry;
  a visible manual retry remains available after reconnecting. Other render errors
  do not trigger automatic recovery.
- Recovery does not erase localStorage, IndexedDB, caches or worker registrations.
  A normal worker update does not reload healthy forms. In-memory input on a page
  that has already crashed is not guaranteed recoverable.
- The fallback follows the theme and selected language, explains connection/update
  failures, and puts wrapped technical details behind an expandable disclosure.
- `frontend/vercel.json` rewrites the concrete React routes to the shell. Missing
  assets retain 404 responses rather than receiving HTML. Shell responses revalidate;
  `sw.js` uses `no-cache`. Add rewrites when introducing new routes.

## Verification and rollout

Run `npm run build --workspace frontend` and
`node frontend/.smoke/deploy-recovery.cjs` from the repository root. The latter uses
two real production builds and Chromium service workers to reproduce the release
mismatch, check bounded recovery, offline behavior and preserved local data.

For the frontend Vercel project, Root Directory must be `frontend` so its config is
read. Deploy the changed files, then verify direct `/login`, `/reset-password` and
`/history` return the app shell, and a missing `/assets/*.js` still returns 404.
The separate backend project is unchanged. Local checks do not verify Vercel's live
routing until that deployment exists.

An already-open client running the old code does not acquire recovery logic
retroactively. After deployment, reload once to let its existing registration update,
then reopen the app if needed. For immediate access before deployment, a private
window opened at the site root avoids the stale browser profile. Avoid clearing all
site data: it would erase locally queued transactions and drafts.

References: [Vite load-error handling](https://vite.dev/guide/build#load-error-handling)
and [Vercel rewrites](https://vercel.com/docs/routing/rewrites).
