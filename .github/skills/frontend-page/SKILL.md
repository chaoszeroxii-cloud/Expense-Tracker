---
name: frontend-page
description: 'Add new frontend pages and API endpoints following project conventions. Use when: creating pages, adding routes, wiring new API endpoints, adding i18n keys, or scaffolding React components with useFetch hooks in the MoneyFlow expense tracker.'
argument-hint: '[describe the page or endpoint]'
---

# Frontend Page & API Endpoint

Adds pages, routes, API endpoints, and i18n keys following the established MoneyFlow frontend conventions. See `AGENTS.md` for architectural overview.

## Conventions (must follow)

| Concern | Rule |
|---------|------|
| **Data fetching** | `useFetch<T>(fetchFn, deps)` generic hook → `{ data, loading, error, refetch }`. All domain hooks are in `frontend/src/hooks/index.ts`. |
| **API client** | Axios instance in `frontend/src/api/index.ts`. Add new endpoint groups as named exports following the `authApi` / `expensesApi` pattern. |
| **i18n** | Add every user-visible string to **both** `en` and `th` dictionaries in `frontend/src/store/i18n.store.ts`. Missing keys return the key string. |
| **Routing** | Routes in `frontend/src/App.tsx`. Use `<PrivateRoute>` for auth, `<Layout>` for bottom-nav pages. The `/add` route is special — no Layout. |
| **UI primitives** | `Card`, `Skeleton`, `Amount`, `Empty` from `components/ui/index.tsx`. Import individually, never use barrel from `components/ui/index.tsx` — use `../../components/ui`. |
| **Icons** | MDI (`@mdi/react` + `@mdi/js`). Find icons in `utils/iconMap.ts` → `MDI_ICON_MAP`. Legacy emoji fallback via `EMOJI_TO_MDI_MAP`. |
| **Theming** | Use Tailwind classes prefixed with `--bg-card`, `--border`, etc. via utility classes: `bg-card`, `border-theme`, `text-base-theme`, `text-muted-theme`, `text-sub`. |
| **Number format** | `toLocaleString('th-TH', { maximumFractionDigits: 0 })` for amounts. Use `<Amount>` component for color-coded amounts. |
| **Types** | Add new types to `frontend/src/types/index.ts`. |
| **Loading** | Wrap content with `{loading ? <Skeleton /> : <Actual />}` pattern. |
| **Animations** | `animate-fade-in` on page root, `animate-fade-up` on cards, with `delay-{75,150,225}` variants for staggered entrance. |

## Procedure

### 1. Add a new API endpoint group

In `frontend/src/api/index.ts`, add a named export following the existing pattern:

```ts
export const newFeatureApi = {
  list: (params?: { /* ... */ }) =>
    http.get<Type[]>('/new-feature', { params }).then(r => r.data),
  create: (payload: CreateDto) =>
    http.post<Type>('/new-feature', payload).then(r => r.data),
  // ...
}
```

### 2. Add domain hook

In `frontend/src/hooks/index.ts`, add:

```ts
export function useNewFeature(deps: string) {
  return useFetch<Type[]>(() => newFeatureApi.list({ deps }), [deps])
}
```

### 3. Add i18n keys

In `frontend/src/store/i18n.store.ts`, add keys to both `en` and `th` dicts.

### 4. Add type

In `frontend/src/types/index.ts`, add any new interfaces.

### 5. Add route

In `frontend/src/App.tsx`:
- For bottom-nav pages: wrap in `<PrivateRoute>` + `<Layout>`.
- For full-screen pages: wrap in `<PrivateRoute>` without Layout.

### 6. Create page

In `frontend/src/pages/NewPage/NewPage.tsx`:

```tsx
import { Card, Skeleton, Amount } from '../../components/ui'
import { useT } from '../../store/i18n.store'
import { useNewFeature } from '../../hooks'

export default function NewPage() {
  const t = useT()
  const { data, loading, error } = useNewFeature()
  // ...
}
```

### 7. Add nav item (if needed)

In `frontend/src/components/layout/Layout.tsx`, add a new `NavLink` with its MDI icon path.
