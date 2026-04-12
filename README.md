# Interval-Based Task Tracker

A gentle, interval-based task tracker for ADHD brains. Not a to-do list — it tracks how long since you last did something and softly surfaces what needs attention. No due dates. No overdue guilt.

## Philosophy

- **Interval-based**, not day-based. Tasks repeat on a flexible cadence (e.g. every 10–14 days).
- **Low pressure.** No red alarms. Warm colors nudge you as a task approaches its interval.
- **One tap to reset.** Tap a task when you do it; the clock resets.

## Visual states

| State       | When                            | Look                    |
|-------------|---------------------------------|-------------------------|
| Fresh       | `daysSince < intervalMin`       | Neutral / calm          |
| Approaching | between min and max             | Warm amber              |
| Due         | `daysSince >= intervalMax`      | Soft terracotta         |

## Run locally

```sh
npm install
npm run dev
```

Data persists in `localStorage` under the key `interval-tracker-v1`.

## Stack

Vite + React. No backend. Pre-populated with household starter tasks on first run.
