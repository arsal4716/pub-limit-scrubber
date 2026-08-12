# Pub Limit Scrubber

A MERN app for scrubbing publisher lead files against two rate-limited buyer
APIs (LM and IC), enforcing a global daily lead cap, a per-publisher daily
cap, and a per-buyer daily API-call cap, with an admin dashboard for
managing limits and reviewing scrub history.

## How it works

1. A publisher visits the site and enters their publisher name. This is
   validated against the admin-managed publisher list before they can move
   on — an unrecognized or disabled name is blocked right there with a clear
   error, and never reaches the upload step. Once validated, they see their
   exact daily limit and how many leads they can still scrub today, with a
   clear note that any leads beyond that will be skipped in the output.
2. They upload a CSV lead file (any size — files are streamed, not loaded
   into memory; comma- or semicolon-delimited files are both auto-detected).
   The upload page shows the exact list of phone-column header names it
   recognizes (`phone_number`, `Phone`, `phone`, `CallerId`, etc. — see
   `phoneUtils.PHONE_HEADER_CANDIDATES`, served via
   `GET /api/scrub/upload-requirements` so the UI can't drift out of sync
   with the actual parser). The server reads the file once to find every
   **unique, valid US phone number**, in the order they first appear.
   Non-US-format phones are marked invalid and never sent to the buyer API.
3. It reserves a slice of that publisher's remaining daily quota (and the
   global daily quota) — whichever is smaller — atomically, so two
   simultaneous uploads can never oversell either limit.
4. Only that many unique phones are sent to the buyer APIs, throttled to
   ~1000 requests/minute per buyer (20 phones every 1.2s, each phone pinging
   both LM and IC at the same time). Everything beyond the reserved slice is
   skipped, not dropped. Each buyer also has its own daily API-call cap
   (see "Buyer API contract" below) — if a buyer's own cap is reached mid-file,
   that buyer is skipped for the remaining phones while the other buyer keeps
   going.
5. The server writes the **original file back out unchanged**, with columns
   appended: `NormalizedPhone`, `ScrubStatus` (`Processed`, `Duplicate In
   File`, `Invalid Phone`, or `Skipped - Daily Limit Reached`), plus a
   per-buyer breakdown: `Buyer1Status`, `Buyer1Message`, `Buyer2Status`,
   `Buyer2Message` (each `Available`, `Blocked`, `Error`, or `Not Checked`
   if that buyer's own daily cap was reached), and `OverallStatus`
   (`Available` if either buyer allowed it, `Blocked` only if every buyer
   that was actually queried blocked it). "Buyer1"/"Buyer2" is an
   anonymized, fixed mapping (buyer1 = LM, buyer2 = IC) — the output file
   and the publisher-facing UI never name the real buyers. No original
   data is ever lost.
6. The publisher can leave the tab — the upload page polls job status and
   shows an ETA (`leads remaining / ~1000 per minute`). A shareable
   `/status/:jobId` link is also shown so they can check back later.
7. Both the global limit and every publisher's limit reset at midnight
   **America/New_York** (configurable) — usage is tracked per calendar day
   in that timezone, so nothing needs a cron job to "reset".
8. Admins log in to `/admin` to set the global daily cap, set each buyer's
   own daily API-call cap (LM/IC, shown by real name — defaults to 100,000
   each), add publishers and set/edit their individual daily caps (validated
   so the sum of publisher caps can never exceed the global cap), and browse
   every scrub job with full stats (including per-buyer blocked counts), a
   download link, and a delete action (removes the job record plus its
   input/output files; blocked while a job is still queued or in progress).

## Stack

- **MongoDB** (Mongoose) — publishers, global config, per-day usage
  counters, scrub job records.
- **Express** — REST API (`server/`).
- **React** (Vite + Tailwind + React Router + TanStack Query) — frontend
  (`server/client/`). In production the built frontend (`server/client/dist`)
  is served by the same Express app on the same port — one process, one
  port (`6003`), no CORS.
- **Node.js** — a single in-process sequential job worker processes one
  upload at a time, which naturally respects the buyer API's global rate
  limit without needing Redis/BullMQ.

## Project layout

```
server/
  src/
    config/       env vars, MongoDB connection
    models/       Publisher, GlobalConfig, DailyUsage, BuyerConfig,
                  BuyerUsage, ScrubJob
    constants/    buyer registry (LM/IC keys, labels, buyer1/buyer2 mapping)
    services/     phone normalization, buyer API client, quota reservation,
                  per-buyer limit reservation, streaming CSV scrub
                  (two-pass), the job queue/worker
    controllers/  request handlers
    routes/       Express routers
    middleware/   admin JWT auth, multer upload, error handler
    app.js        API routes + serves server/client/dist as static files,
                  with an SPA fallback for client-side routes
  client/         React app (Vite). `npm run build` here produces `dist/`,
    src/          which server/src/app.js serves directly - single port.
      pages/            HomePage, UploadPage, StatusPage, admin/*
      components/        shared UI + admin/* (publisher table, jobs table, etc.)
      api/               axios wrappers per resource
      context/           admin auth context
```

## Buyer API contract

Every normalized phone is sent to **both** buyers at the same time:

- **LM (ACA — callgrid)**, configured via `LM_BUYER_API_URL`:
  `GET {LM_BUYER_API_URL}?CallerId=1{phone}`. Response `{ code, message }`
  where `code` `4007` or `4005` means blocked; any other code is treated
  as available.
- **IC (ACA — salesradix)**, configured via `IC_BUYER_API_URL`:
  `GET {IC_BUYER_API_URL}?PhoneNumber=1{phone}&Vertical={IC_VERTICAL}&SubSourceID={IC_SUBSOURCE_ID}&ResponseType=json`.
  Response `{ result }` where `result === "Available"` (case-insensitive)
  means available; anything else is treated as blocked/duplicate.

Network/API errors for a buyer are recorded as `Error` for that buyer
rather than failing the whole job. Each buyer also has its own daily
API-call cap, seeded at 100,000 in the DB and from then on only ever
changed from the admin dashboard (no env var) — once a buyer's cap is
reached for the day, it's skipped (`Not Checked`) for the rest of that
buyer's calls, independent of the other buyer and of the global lead limit.

A phone's overall status is `Available` if either buyer allowed it, and
`Blocked` only if every buyer that was actually queried reported it
blocked. Output columns and the publisher-facing summary only ever refer
to `Buyer1`/`Buyer2` (buyer1 = LM, buyer2 = IC, fixed) — publishers never
see which real buyer each slot is.

## Getting started

Requires Node 18+ and a MongoDB instance (a real one in production; in
development, if `MONGO_URI` is left blank the server auto-starts an
in-memory MongoDB via `mongodb-memory-server` — no local install needed,
as long as your machine can download the MongoDB binary once).

```bash
npm run install:all
cp server/.env.example server/.env             # edit ADMIN_PASSWORD, LM/IC_BUYER_API_URL, etc.
cp server/client/.env.example server/client/.env
npm run dev                                     # runs server (:6003) and client (:5173) together
```

Visit http://localhost:5173 (the Vite dev server, which proxies `/api` to
`:6003` for hot-reloading during development). Admin login is at
`/admin/login` (not linked from the public nav — it's for internal use only)
using `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `server/.env`.

On first boot there are no publishers — sign in to `/admin`, set your
global daily limit (defaults to 100,000), review each buyer's daily
API-call cap (LM/IC, also defaults to 100,000 each), and add publishers
with their own daily limits before anyone can upload a file for them.

### Production: single port

In production there's no separate frontend server — the React app is built
once and Express serves the static files (plus an SPA fallback for
client-side routes like `/upload/:publisherName`) from the same port as the
API:

```bash
npm run install:all
npm run build     # builds server/client -> server/client/dist
npm start         # serves the API + the built frontend, both on :6003
```

Visit http://localhost:6003 for everything — no CORS, no second process,
no separate origin to configure.

### Environment variables (`server/.env`)

See `server/.env.example` for the full list, notably:

- `LM_BUYER_API_URL` / `IC_BUYER_API_URL` — each buyer's API endpoint.
- `IC_VERTICAL` / `IC_SUBSOURCE_ID` — extra query params IC's API requires.
- Each buyer's own daily API-call cap is **not** an env var — it's a DB
  document seeded at 100,000 on first boot, changeable only from the admin
  dashboard's "Buyer API daily limits" card from then on.
- `BUYER_API_CONCURRENCY` / `BUYER_API_BATCH_DELAY_MS` — shared rate limit
  knobs (defaults to 20/1200ms ≈ 1000/min per buyer).
- `DEFAULT_TOTAL_DAILY_LIMIT` — seed value for the global cap (100,000).
- `LIMIT_RESET_TIMEZONE` — defaults to `America/New_York`.
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_JWT_SECRET` — single-admin
  login. There's no multi-user admin system in this version.

## Notes & known limitations

- Publishers can't see each other's names or upload activity: the home page
  is a plain free-text field (no autocomplete/dropdown of existing
  publishers), and the only public publisher-related endpoint
  (`GET /api/publishers/validate?name=`) resolves one exact name at a time
  and never returns a list — only the JWT-protected admin API can list every
  publisher. Both the home page and the upload page call this endpoint to
  gate progress and show the publisher their own daily limit; the upload
  endpoint independently re-validates server-side regardless.
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
