# Interval-Based Task Tracker

A gentle, interval-based task tracker for ADHD brains. Not a to-do list — it tracks how long since you last did something and softly surfaces what needs attention. No due dates. No overdue guilt.

## Philosophy

- **Interval-based**, not day-based. Tasks repeat on a flexible cadence (e.g. every 10–14 days).
- **Low pressure.** No red alarms. Warm colors nudge you as a task approaches its interval.
- **One tap to reset.** Tap a task when you do it; the clock resets.

## Visual states

| State       | When                            | Look                         |
|-------------|---------------------------------|------------------------------|
| Fresh       | `daysSince < intervalMin`       | Calm / neutral               |
| Approaching | between min and max             | Warm amber stripe + tint     |
| Due         | `daysSince >= intervalMax`      | Soft terracotta stripe + tint|
| Snoozed     | explicit user action            | Muted, in its own section    |

## Using this as an iPad app

1. Deploy it (see below) to get a URL.
2. Open the URL in Safari on your iPad.
3. Tap Share → "Add to Home Screen."
4. It launches fullscreen with its own icon, works offline, saves data locally.

Data lives in `localStorage` on that device — export a JSON backup from the Settings sheet every so often until real sync is built.

## Run locally

```sh
npm install
npm run dev      # dev server with hot reload
npm test         # run unit tests
npm run build    # production build into ./dist
```

## Deploy

The repo includes a GitHub Actions workflow that publishes `./dist` to a `gh-pages` branch on every push to `main`. In repo Settings → Pages, set the source to "Deploy from a branch" → `gh-pages` / root.

Or import into Vercel / Netlify — both auto-detect the Vite config. No env vars needed.

## Stack

- **Vite + React** (no router — single screen)
- **PWA** via `vite-plugin-pwa` — service worker, offline support, manifest
- **localStorage** persistence
- **Vitest** for the task/state logic

## Features

- 8 starter household tasks on first run
- Tap to mark done · undo toast · "done yesterday / 2d / 3d ago"
- Reorder · snooze (1d / 3d / 7d) · quick-snooze from row
- Completion history + simple stats per task
- Optional notes per task
- Warm Japanese-stationery light palette · candlelight dark palette
- In-app "just became due" notification
- JSON export / import · reset to starter tasks

## Roadmap (not yet built)

- Multi-device sync (Supabase backend)
- Push notifications (iOS PWA support is still fiddly)
- Native iOS wrapper via Capacitor, for App Store distribution
- Voice check-ins (Siri / Google)
