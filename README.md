# MineCore · Fleet Telemetry Dashboard

A real-time fleet health monitoring dashboard, built as a proof-of-concept in the spirit of operational telemetry products like Komatsu MineCare. It simulates a fleet of mining machines streaming live sensor data, charts that data as it arrives, and runs a statistical anomaly detector that scores each machine's health and surfaces alerts.

> Built as a focused demonstration: a real-time, sensor-driven system surfaced through a modern React frontend.

## Stack

- **React 19** + **TypeScript** (strict)
- **Vite** for dev/build tooling
- **Recharts** for time-series visualization
- **Tailwind v4** (Vite plugin) + hand-authored CSS for the visual identity
- **Anthropic API** via a serverless function for on-demand incident analysis

## Run it locally

```bash
npm install
npm run dev      # http://localhost:5173 — AI feature works here too
npm run build    # type-check + production build into /dist
```

## Deploy (Vercel)

1. Push the project to a GitHub repo.
2. Import it at vercel.com — Vite is auto-detected, no build config needed.
3. In the project's **Settings → Environment Variables**, add `ANTHROPIC_API_KEY` with your key, then deploy. Vercel turns `/api/summarize.ts` into a serverless function automatically.

## How it's architected

The codebase is deliberately layered so each concern is testable and swappable in isolation:

- **`src/types.ts`** — the shared domain model. Defined first, before any UI.
- **`src/data/fleet.ts`** — the starting roster and each machine's simulation parameters. Swap this for a real API client and nothing downstream changes.
- **`src/hooks/useFleetTelemetry.ts`** — a custom hook that owns the data lifecycle: it generates a telemetry frame every 1.5s on an interval, appends to a bounded rolling history, and re-scores each machine. Returns live data to the view with a single line of consumption.
- **`src/lib/anomaly.ts`** — the detection layer. Learns each sensor channel's normal behavior from its own recent history (rolling mean + standard deviation) and scores how many standard deviations the latest reading sits from that baseline. The per-channel deviations fuse into one 0–100 health score per machine. The detail charts draw this learned envelope (mean ± 2σ) as a shaded band, so the math the detector is doing is visible.
- **`src/lib/predict.ts`** — predictive maintenance. Fits an ordinary least-squares trend to each channel's recent samples and projects when it will cross a hard operational limit ("redline"), surfaced as a live time-to-failure countdown on each machine.
- **`src/components/`** — presentation only. Data flows down via props; events flow up via callbacks.
- **`api/summarize.ts`** — a Vercel serverless function (a microservice) that proxies to the Anthropic API. The key lives here as an environment variable, never in the client. `api/_lib/summarize-core.ts` holds the shared prompt + API logic, reused by a Vite dev middleware so the feature also works under `npm run dev`.

## On the anomaly scoring

Rather than fixed thresholds (`temp > 110 = bad`), the detector computes a **z-score** per channel against an adaptive baseline. This is the same instinct as adaptive filtering: the baseline tracks the signal instead of being hard-coded. The scoring interface is model-agnostic — the z-score can be swapped for a learned detector (autoencoder reconstruction error, isolation forest) without touching the UI.

## What I'd do next

- Replace the simulation hook with a real WebSocket/SSE feed; the component layer wouldn't change.
- Move the streaming store behind `useSyncExternalStore` so the feed lives outside the React tree.
- Code-split Recharts via dynamic import to trim the initial bundle.
- Persist a learned per-machine baseline rather than recomputing the window each tick.
