# Frontend (Next.js)

## Setup

```bash
npm install
copy .env.local.example .env.local
```

## Run

```bash
npm run dev
```

Opens at http://localhost:3000. Expects the backend running at the URL in
`NEXT_PUBLIC_API_BASE_URL` (default http://localhost:8000).

## Layout

- `app/page.tsx` — landing page linking to the three features
- `app/coach/page.tsx` — AI Coach (upload + feedback + chat)
- `app/midi-analyzer/page.tsx` — MIDI Analyzer (upload + results)
- `app/lyrics/page.tsx` — Lyric Lab (analyze + generate)
- `components/` — shared UI (`NavBar`, `FeatureCard`)
- `lib/api.ts` — all backend fetch calls in one place

## Current status

All three pages are wired to call the backend already. Since the backend's feature logic isn't
implemented yet (see [../PLAN.md](../PLAN.md)), submitting a form will currently show a
"not built yet" error sourced from the backend's `501` response — that's expected until each
phase lands. The theme is a placeholder dark style; real visual identity is Phase 4.
