# Boot smoke test

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
