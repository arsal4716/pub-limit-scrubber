# Pub Limit Scrubber

A MERN app for scrubbing publisher lead files against two rate-limited buyer
APIs (LM and HC). Each buyer grants every publisher its own daily
allotment (not a pool shared across publishers), and a global daily
capacity ceiling caps how many publishers those allotments can support.
Includes an admin dashboard for managing limits and reviewing scrub
history.

## How it works

1. A publisher visits the site and enters their publisher name. This is
   validated against the admin-managed publisher list before they can move
   on — an unrecognized or disabled name is blocked right there with a clear
   error, and never reaches the upload step. Once validated, they see their
   daily limit (the sum of both buyers' per-publisher allotments — e.g.
   100,000 from each buyer = 200,000/day) and how many leads they can still
   scrub today.
2. They upload a CSV lead file (any size — files are streamed, not loaded
   into memory; comma- or semicolon-delimited files are both auto-detected).
   Column headers are matched automatically regardless of case, spacing,
   underscores, or hyphens (`phoneUtils.PHONE_HEADER_CANDIDATES`,
   `STATE_HEADER_CANDIDATES`, served via `GET /api/scrub/upload-requirements`
   so the UI can't drift out of sync with the actual parser). A state
   column is required (2-letter code or full state name, any case — "AZ",
   "az", and "Arizona" all work), used per-lead for the HC buyer call. The
   server reads the file once to find every **unique, valid US phone
   number** (any common format — dashes, parens, dots, a leading country
   code, or a trailing extension are all handled), in the order they first
   appear. Non-US-format phones are marked invalid and never sent to the
   buyer APIs.
3. There's no upfront pool reservation — every unique phone in the file is
   attempted. Capacity is enforced live, per buyer, per publisher (see
   "Limits: buyer allotments and global capacity" below).
4. LM and HC both scrub against the same underlying suppression data, so
   checking a phone against both would be redundant. Instead, the unique
   phones are **split roughly in half** (first half → buyer1/LM, second
   half → buyer2/HC, in first-occurrence order — e.g. 90,000 unique phones
   become 45,000 to each buyer) and both halves are processed
   **concurrently**, each throttled to ~1000 requests/minute (20 phones
   every 1.2s per buyer) — so total throughput is ~2000 unique phones/minute
   combined, not 1000. If a phone's assigned buyer is out of *this
   publisher's* daily allotment from that buyer, that phone is left
   unprocessed (`Not Checked`) rather than being redirected to the other
   buyer.
5. The server writes the **original file back out unchanged**, with columns
   appended: `NormalizedPhone`, `ScrubStatus` (`Processed`, `Duplicate In
   File`, or `Invalid Phone`), `BuyerAssigned` (`Buyer 1` or `Buyer 2` — an
   anonymized, fixed mapping; buyer1 = LM, buyer2 = HC — the output file
   and the publisher-facing UI never name the real buyers), `BuyerStatus`
   (`Available`, `Blocked`, `Error`, or `Not Checked` if that publisher's
   allotment from that buyer was already used up today), and
   `BuyerMessage`. Since each phone is checked by exactly one buyer, there's
   a single status/message pair per row, not one per buyer. No original
   data is ever lost.
6. The publisher can leave the tab — the upload page polls job status and
   shows an ETA (`leads remaining / ~2000 per minute combined`). A
   shareable `/status/:jobId` link is also shown so they can check back
   later.
7. Every buyer allotment resets at midnight **America/New_York**
   (configurable) — usage is tracked per calendar day in that timezone, so
   nothing needs a cron job to "reset".
8. Admins log in to `/admin` to set each buyer's daily allotment (LM/HC,
   shown by real name — the amount EVERY publisher individually gets from
   that buyer, defaults to 100,000 each), set the global daily capacity
   ceiling (validated so `active publishers × (LM limit + HC limit)` can
   never exceed it), add/enable/disable publishers (activating one is
   rejected if it would breach that ceiling), and browse every scrub job
   with full stats (including per-buyer blocked counts), a download link,
   and a delete action (removes the job record plus its input/output files;
   blocked while a job is still queued or in progress).

## Stack

- **MongoDB** (Mongoose) — publishers, global capacity config, per-buyer
  daily allotments, per-publisher-per-buyer usage counters, scrub job
  records.
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
    models/       Publisher, GlobalConfig, BuyerConfig, BuyerUsage, ScrubJob
    constants/    buyer registry (LM/HC keys, labels, buyer1/buyer2 mapping)
    services/     phone normalization, buyer API client, per-publisher
                  buyer-limit reservation and capacity validation,
                  streaming CSV scrub (two-pass), the job queue/worker
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

LM and HC both scrub against the same underlying suppression data, so each
normalized phone is routed to exactly **one** buyer rather than checked
against both — the unique phone list is split roughly in half (first half
→ LM/buyer1, second half → HC/buyer2, in first-occurrence order) and both
halves are processed concurrently, each in its own pacing loop:

- **LM (ACA — callgrid)**, configured via `LM_BUYER_API_URL`:
  `GET {LM_BUYER_API_URL}?CallerId=1{phone}`. Response `{ code, message }`
  where `code` `4007` or `4005` means blocked; any other code is treated
  as available.
- **HC (ACA — NextGen Insurance Solutions)**, configured via
  `HC_BUYER_API_URL`: `GET {HC_BUYER_API_URL}?state={state}&caller_id=1{phone}`,
  where `state` is that lead's state from the CSV (abbreviation or full
  name, any case). Duplicate/suppression is read solely from the response's
  `phs_suppressed` field (`true` means blocked) — the capacity/routing
  fields in the same response (`accept`, `status`, `agents`, etc.) are
  informational only and don't affect the scrub result. A lead with no
  state value is recorded as `Error` for HC without calling the API (and
  without spending HC's daily quota) rather than guessing a state.

Network/API errors are recorded as `Error` for that phone rather than
failing the whole job.

Output columns and the publisher-facing summary only ever refer to
`Buyer 1`/`Buyer 2` (buyer1 = LM, buyer2 = HC, fixed) — publishers never
see which real buyer checked a given phone.

## Limits: buyer allotments and global capacity

There's no shared "pool" of leads consumed as jobs run. Instead:

- **Each buyer's daily limit is a per-publisher allotment**, not a total
  pool split across publishers. If LM's daily limit is 100,000, *every*
  publisher independently gets up to 100,000 LM checks per day — Publisher
  A using its full 100,000 doesn't take anything away from Publisher B's
  own 100,000. Seeded at 100,000 for each buyer in the DB and changed only
  from the admin dashboard (no env var). Once a publisher has used up its
  allotment from a buyer for the day, any phone still routed to that buyer
  is left `Not Checked` for the rest of that publisher's jobs that day —
  there's no fallback to the other buyer.
- **A publisher's own daily lead capacity is derived**, not manually set:
  it's always `(LM's daily limit) + (HC's daily limit)`, the same for
  every publisher (e.g. 100,000 + 100,000 = 200,000/day). There's no
  separate per-publisher limit to configure.
- **The global daily limit is a capacity-planning ceiling, not a live
  usage counter.** It bounds how many *active* publishers the current
  buyer limits can support: `(active publisher count) × (LM limit + HC
  limit)` must never exceed it. E.g. with an 800,000 global limit and both
  buyers set to 100,000 (200,000/publisher), at most 4 publishers can be
  active at once (4 × 200,000 = 800,000); lowering both buyer limits to
  50,000 each (100,000/publisher) would let up to 8 publishers be active
  under the same 800,000 ceiling. Lowering a buyer's limit, raising the
  global limit, or activating a new publisher are all validated against
  this formula and rejected with a clear error if they'd overcommit it.
- The admin dashboard shows, per buyer, how many total calls have been
  used **across all publishers combined today** (informational only — not
  a cap), and shows the global card's "committed capacity" as `active
  publishers × per-publisher capacity` against the global ceiling.

## Getting started

Requires Node 18+ and a MongoDB instance (a real one in production; in
development, if `MONGO_URI` is left blank the server auto-starts an
in-memory MongoDB via `mongodb-memory-server` — no local install needed,
as long as your machine can download the MongoDB binary once).

```bash
npm run install:all
cp server/.env.example server/.env             # edit ADMIN_PASSWORD, LM/HC_BUYER_API_URL, etc.
cp server/client/.env.example server/client/.env
npm run dev                                     # runs server (:6003) and client (:5173) together
```

Visit http://localhost:5173 (the Vite dev server, which proxies `/api` to
`:6003` for hot-reloading during development). Admin login is at
`/admin/login` (not linked from the public nav — it's for internal use only)
using `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `server/.env`.

On first boot there are no publishers — sign in to `/admin`, review each
buyer's daily allotment (LM/HC, defaults to 100,000 each — every publisher
gets this amount from each buyer), review the global capacity ceiling
(defaults to 1,000,000, comfortably supporting several publishers at the
default allotments), and add publishers before anyone can upload a file
for them.

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

- `LM_BUYER_API_URL` / `HC_BUYER_API_URL` — each buyer's API endpoint.
- Each buyer's per-publisher daily allotment is **not** an env var — it's a
  DB document seeded at 100,000 on first boot, changeable only from the
  admin dashboard's "Buyer API daily limits" card from then on.
- `BUYER_API_CONCURRENCY` / `BUYER_API_BATCH_DELAY_MS` — shared rate limit
  knobs (defaults to 20/1200ms ≈ 1000/min per buyer).
- `DEFAULT_TOTAL_DAILY_LIMIT` — seed value for the global capacity ceiling
  (1,000,000). Must exceed at least one publisher's derived capacity (sum
  of both buyer allotments) or no publisher can be activated.
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
  reprocesses every unique phone from scratch, but any buyer calls already
  made before the crash are re-sent and re-counted against that
  publisher's daily allotment for each buyer - an accepted tradeoff for not
  needing to persist partial per-phone results.
- There's currently no per-publisher override of a buyer's allotment - the
  same LM/HC daily limit applies uniformly to every publisher. Per-publisher
  overrides would be a natural extension if that's ever needed.
