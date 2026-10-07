# Category icons from the installed MDI catalog

## Acceptance

- Keep the existing preset buttons and legacy icon IDs/emoji working. Add a code
  field in the category editor, accepting `mdi:train`, `mdi-train`, `train`, or
  JavaScript export names such as `mdiAccountCashOutline`.
- Preview a verified icon before saving. Invalid names and load failures show
  distinct messages; never silently replace a user's custom choice on save.
- Persist the canonical `mdi...` export name in the existing icon column. Show
  it anywhere categories render through IconDisplay, including history/capture.
- Support the entire installed @mdi/js catalog without maintaining a manual list.
  Do not accept HTML/SVG markup, arbitrary URLs or external icon-pack code.

## Implementation order

1. Backend: declare @mdi/js as a direct dependency, extend icon normalization and
   category validation using own-property catalog membership; keep presets/legacy
   fallback behavior for other callers. Existing JWT/user ownership remains.
2. Frontend: Vite virtual URL catalog pointing to lazy JSON groups by initial
   character, generated from @mdi/js at build/dev time. Add a bounded public-icon
   cache for hash-named JSON assets. Fetch retries work after network failures;
   failed ESM module imports remain cached by the browser and cannot serve this
   retry flow. No new API, third-party runtime request or main-bundle
   full-catalog import. Resolve names with a bounded grammar and cache/deduplicate
   loads. Rendering uses trusted catalog path strings as SVG path attributes.
3. Category editor: code input, loading/error/verified state, preview, catalog link,
   saved code restoration, clear custom code by choosing a preset. Preserve memo
   code functionality from the preceding task. Add bilingual strings.
4. Verify backend/catalog unit tests, typechecks/builds, isolated API persistence
   and ownership, browser preview/invalid/retry/save/reload/history, lazy loading,
   and a production build asset/cache check. No new database migration or env.

## Security and limits

Never interpolate user text into asset paths or SVG/HTML markup. Load only fixed
URLs generated from the dependency; validate dictionary own properties.
Existing icon varchar(50) remains sufficient for canonical export names. Empty
existing icons still fall back; unknown custom category input fails with a bounded
error code. No memo, token, or user data is sent with static asset requests. The
installed package version defines the available icons; upgrading the package adds
new names on the next build. Previously loaded groups work offline under a separate
26-entry, 30-day PWA cache; an uncached group needs an initial online load.
