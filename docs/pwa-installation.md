# Mobile installation

The sign-in page and Settings offer the same install card. It uses the current
browser's capabilities and provides Android, iOS and desktop instructions when a
native prompt is unavailable. Opening the installed standalone app hides promotion.

On Android, `beforeinstallprompt` is captured in `main.tsx` before React mounts.
The transient Zustand store retains the event across routes. A user click calls
`prompt()` exactly once per event. Dismissing or rejecting the prompt leaves manual
instructions available; a later browser event enables a fresh attempt. No account,
draft or offline queue is cleared. Neither prompt acceptance nor `appinstalled`
is presented as proof of completed OS installation: Android may still be creating
the WebAPK after those signals.

On iPhone/iPad, the card explains Share → Add to Home Screen in Safari or Chrome.
It does not simulate a native Android install dialog. iPads advertising a desktop
user agent are detected through MacIntel plus touch support.

The manifest's explicit `id: '/'` matches its previous inferred identity from
`start_url: '/'`; this is not a new application identity for existing installations.
Use the deployed HTTPS origin on a phone. A PC's `localhost` and an ordinary HTTP
LAN address are not valid substitutes.

## Findings from 2026-09-30

The user reported that Chrome on Android displayed a failure **immediately after
selecting its install menu**, rather than after opening an installed home-screen icon.
The device model, browser version and exact native error are still needed to identify
that failure. Adding an in-page button uses the same browser installer; it cannot
bypass or guarantee a repair of an Android/WebAPK failure.

Unauthenticated checks of `https://expense-tracker-fe-tau.vercel.app` found:

- `/`, `/login`, the manifest, worker and all manifest icons returned 200.
- The 192×192 and 512×512 PNG dimensions matched the manifest; the separate maskable
  icon was also 512×512.
- Fresh persistent Chromium 153 with an Android user agent loaded Login without
  page errors or failed requests, activated the worker, and reported no errors from
  `Page.getAppManifest` or `Page.getInstallabilityErrors`.

These are website/browser checks, not evidence of successful installation on a real
Android device. Do not label an unobserved Play Store, network, browser or device issue
as the cause without a device error/log.

## Separate first-launch offline bug

A fresh visit loaded the lazy Login chunk before the new worker controlled the page.
Its cache contained the shell and entry bundle but not Login. After worker activation,
going offline and reopening `start_url` reliably showed the page-load error screen.
The older test had visited Login a second time, hiding this first-visit gap.

Login is now imported with the boot bundle, so its dependencies are available with
the precached shell after the first successful worker installation. Reports and the
other secondary routes remain lazy. Offline sign-in still requires a connection to
authenticate; rendering the form is not offline authentication. This fix addresses
the reproduced launch issue, not the reported native installation-menu failure.

## Verification

From the repository root:

```sh
npm run build --workspace frontend
node frontend/.smoke/pwa-install.cjs
node frontend/.smoke/deploy-recovery.cjs
```

The install suite covers prompt lifecycle and the UI with synthetic browser events,
mock account responses and mobile layouts. The deploy suite uses two real production
builds and workers, including the cold offline start. No native Android/iOS installer
is exercised. After deploying, repeat installation on the affected phone and capture
the exact Chrome message and Chrome/Android versions if it still fails. Remote Chrome
DevTools can inspect the phone's page/console; do not clear site data containing
unsent entries merely to collect a clean test.

References: [Chrome install flow](https://web.dev/learn/pwa/installation-prompt),
[installation detection limits](https://web.dev/learn/pwa/detection),
[Chrome on iOS](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DiOS&hl=en),
and [Chromium WebAPK architecture](https://github.com/chromium/chromium/blob/main/chrome/android/webapk/README.md).
