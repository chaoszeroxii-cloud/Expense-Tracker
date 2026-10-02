# Boot smoke test

The frontend build typechecks browser code against ES2020. Keep `types: ["vite/client"]`
in `tsconfig.json`: automatically including workspace-wide Node types used to add
`Array.at` through `@types/node/compatibility/indexable.d.ts`, masking an ES2022 API
in local builds that failed with TS2550 on Vercel. Last-element access in capture and
day review uses indexing so the ES2020 requirement is preserved. `npm run build`
now catches this mismatch locally even when the backend's Node types are installed.

Loads the production bundle in a real browser and asserts the app actually renders.

It exists because a build can be green in every static check and still white-screen. That
happened here: `useGoogleLogin` initialises Google's token client with whatever
`VITE_GOOGLE_CLIENT_ID` holds, and with an empty one it throws from an effect. With no
ErrorBoundary in the tree React unmounted everything, so the whole app was a blank page —
for anyone following the README quick start, which does not set that variable. `tsc` and
`vite build` were both perfectly happy.

```bash
npm run build
npm run preview -- --port 4173 &
SMOKE_URL=http://localhost:4173 node .smoke/boot.cjs
```

Run it both ways — with and without `VITE_GOOGLE_CLIENT_ID` set at build time. Both must
render; only the visible sign-in buttons should differ.

Exit code is 0 when the app rendered and produced no page errors. `/_vercel/speed-insights`
404s outside Vercel and is filtered out.

## Deployment and offline recovery

From the repository root, run `node frontend/.smoke/deploy-recovery.cjs`.
It builds two production releases, starts a local static server using the Vercel route
map, and switches releases while real Chromium tabs and service workers are open.
No database, backend, Vercel credentials or real user data is involved. Builds,
screenshots and results stay under the ignored `.smoke/ux-artifacts/deploy-recovery/`.

Checks cover an uncached old lazy-route chunk returning 404 after deployment; preservation
of the token, capture draft and IndexedDB offline queue; worker activation without
interrupting a form; fresh online HTML even when worker updates fail; permanent chunk
failure without a reload loop; unrelated application errors; blocked sessionStorage;
offline cached pages; reconnecting with the route/query intact; and exclusion of API
responses and reset-password query strings from shared caches. Every concrete route
in `App.tsx` must have a rewrite, and missing assets must remain 404s. A first-visit
offline launch now checks that Login ships in the precached boot bundle, without
requiring a second visit. Forgot Password exercises the remaining lazy-route cases.

This is local browser/routing verification, not a production Vercel deployment check.
See [deployment recovery](../../docs/deploy-recovery.md) for the incident and rollout notes.

## Install-button browser checks

Run `npm run build --workspace frontend`, then `node frontend/.smoke/pwa-install.cjs`
from the repository root. The script serves the production bundle locally and tests
early prompt capture, one use per prompt, cancellation/retry, prompt failure, preserved
form input, the Settings entry point, Android/iPhone/iPad instructions, standalone
hiding, HTTPS/offline guidance, and the manifest's existing identity and icon sizes.
It also checks for page exceptions and unexpected API writes.

Native prompt events and user choices are simulated; this does **not** install an
Android WebAPK or an iOS home-screen app. Mobile user agents in desktop Chromium are
not a substitute for testing on the affected phone. Screenshots and results live in
the ignored `.smoke/ux-artifacts/pwa-install/` directory.

## Visual and loading regression checks

`visual-refresh.cjs` starts its own real Nest server and migrates a disposable database.
It checks card alignment, retained form drafts during refresh, slow loading, month-response
races, reduced motion, Thai desktop/mobile layouts in both themes, and PWA icon geometry.
`--with-flows` also runs the planning and daily-flow browser/API suites.

From the repository root, with Docker running:

```powershell
docker run --name moneyflow_visual_db -e POSTGRES_USER=expense_user -e POSTGRES_PASSWORD=visual-local-only -e POSTGRES_DB=moneyflow_visual_test -p 127.0.0.1:15435:5432 -d postgres:16-alpine
npm run build --workspace backend
$env:VITE_API_URL = 'http://127.0.0.1:3096'
Set-Location frontend
node ../node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5175 --strictPort
```

Once Postgres is ready, use another terminal:

```powershell
node frontend/.smoke/visual-refresh.cjs --with-flows
```

Screenshots and results are saved under `.smoke/ux-artifacts/visual-refresh/` (ignored).
The test exits its backend automatically. Stop the Vite terminal and remove the disposable
container with `docker rm -f moneyflow_visual_db` when finished. Never use a live database.
