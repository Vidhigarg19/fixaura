# FixAura

AR-powered repair assistant — scan a broken item, get AI diagnosis, gather tools, and follow step-by-step guidance with AR overlays.

## Stack

- React 18+ / TypeScript / Vite
- Tailwind CSS v4
- Framer Motion
- React Router v6+
- Lucide React, react-countup, react-intersection-observer, lottie-react

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Environment

Copy `.env.example` to `.env` and set `VITE_ANTHROPIC_API_KEY` for live Claude vision analysis. Without a key, the app uses realistic mock diagnosis data.

## User flow

| Route | Page |
|-------|------|
| `/` | Landing |
| `/capture` | Camera capture |
| `/diagnosis` | AI diagnosis + confidence |
| `/tools` | Tool checklist |
| `/guide` | AR repair guide |
| `/done` | Completion + savings |

## i18n

Strings live in `src/i18n/en.json` and `src/i18n/hi.json`. Use the language toggle in the navbar to switch.

## Build

```bash
npm run build
npm run preview
```
