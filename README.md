# Pub Limit Scrubber

A MERN app for scrubbing publisher lead files against a rate-limited buyer API,
enforcing a global daily lead cap plus a per-publisher daily cap, with an
admin dashboard for managing limits and reviewing scrub history.

## How it works

1. A publisher visits the site, enters their publisher name, and uploads a
   CSV lead file (any size — files are streamed, not loaded into memory).
2. The server reads the file once to find every **unique, valid US phone
   number**, in the order they first appear. Non-US-format phones are
   marked invalid and never sent to the buyer API.
3. It reserves a slice of that publisher's remaining daily quota (and the
   global daily quota) — whichever is smaller — atomically, so two
   simultaneous uploads can never oversell either limit.
4. Only that many unique phones are sent to the buyer API, throttled to
   ~1000 requests/minute (20 concurrent requests every 1.2s, matching the
   reference scrubbing script). Everything beyond the reserved slice is
   skipped, not dropped.
5. The server writes the **original file back out unchanged**, with columns
   appended: `NormalizedPhone`, `Duplicate`, `BuyerCode`, `BuyerMessage`,
   `ScrubStatus` (`Processed`, `Duplicate In File`, `Invalid Phone`, or
   `Skipped - Daily Limit Reached`). No original data is ever lost.
6. The publisher can leave the tab — the upload page polls job status and
   shows an ETA (`leads remaining / ~1000 per minute`). A shareable
   `/status/:jobId` link is also shown so they can check back later.
7. Both the global limit and every publisher's limit reset at midnight
   **America/New_York** (configurable) — usage is tracked per calendar day
   in that timezone, so nothing needs a cron job to "reset".
8. Admins log in to `/admin` to set the global daily cap, add publishers and
   set/edit their individual daily caps (validated so the sum of publisher
   caps can never exceed the global cap), and browse every scrub job with
   full stats and a download link.

## Stack

- **MongoDB** (Mongoose) — publishers, global config, per-day usage
  counters, scrub job records.
- **Express** — REST API (`server/`).
- **React** (Vite + Tailwind + React Router + TanStack Query) — frontend
  (`client/`).
- **Node.js** — a single in-process sequential job worker processes one
  upload at a time, which naturally respects the buyer API's global rate
  limit without needing Redis/BullMQ.

## Project layout

```
server/
  src/
    config/       env vars, MongoDB connection
    models/       Publisher, GlobalConfig, DailyUsage, ScrubJob
    services/     phone normalization, buyer API client, quota reservation,
                  streaming CSV scrub (two-pass), the job queue/worker
    controllers/  request handlers
    routes/       Express routers
    middleware/   admin JWT auth, multer upload, error handler
client/
  src/
    pages/            HomePage, UploadPage, StatusPage, admin/*
    components/        shared UI + admin/* (publisher table, jobs table, etc.)
    api/               axios wrappers per resource
    context/           admin auth context
```

## Buyer API contract

Configured via `BUYER_API_URL` — the normalized 10-digit phone is appended
directly to this URL as a `GET` request (matching the reference script):

```
GET {BUYER_API_URL}{phone}
```

Response `{ code: 4007, message }` means the CallerId is blocked/duplicate;
any other response is treated as accepted. Network/API errors are recorded
per-lead as `Duplicate: Error` rather than failing the whole job.

## Getting started

Requires Node 18+ and a MongoDB instance (a real one in production; in
development, if `MONGO_URI` is left blank the server auto-starts an
in-memory MongoDB via `mongodb-memory-server` — no local install needed,
as long as your machine can download the MongoDB binary once).

```bash
npm run install:all
cp server/.env.example server/.env   # edit ADMIN_PASSWORD, BUYER_API_URL, etc.
cp client/.env.example client/.env
npm run dev                          # runs server (:5000) and client (:5173) together
```

Visit http://localhost:5173. Admin login is at `/admin/login` using
`ADMIN_USERNAME` / `ADMIN_PASSWORD` from `server/.env`.

On first boot there are no publishers — sign in to `/admin`, set your
global daily limit (defaults to 100,000), and add publishers with their own
daily limits before anyone can upload a file for them.

### Environment variables (`server/.env`)

See `server/.env.example` for the full list, notably:

- `BUYER_API_URL` — the buyer API endpoint (phone digits are appended).
- `BUYER_API_CONCURRENCY` / `BUYER_API_BATCH_DELAY_MS` — rate limit knobs
  (defaults to 20/1200ms ≈ 1000/min).
- `DEFAULT_TOTAL_DAILY_LIMIT` — seed value for the global cap (100,000).
- `LIMIT_RESET_TIMEZONE` — defaults to `America/New_York`.
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_JWT_SECRET` — single-admin
  login. There's no multi-user admin system in this version.

## Notes & known limitations

- Admin auth is a single hardcoded account from env vars — sufficient for an
  internal tool, but swap in a real user store if multiple admins with
  different roles are ever needed.
- The worker processes one job at a time (sequential FIFO). This is
  intentional — it's the simplest way to guarantee the buyer API's global
  rate limit is respected across every publisher's uploads without a
  separate distributed rate limiter. A publisher's ETA grows if other jobs
  are queued ahead of it.
- If the server crashes mid-job, on restart it re-analyzes the file and
  resumes from `processing` without double-reserving quota (guarded by a
  `quotaReserved` flag), but any buyer API calls already made before the
  crash are re-sent — the buyer API is treated as idempotent/read-only per
  the reference script's design.
