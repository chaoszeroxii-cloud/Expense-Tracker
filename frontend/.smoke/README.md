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
