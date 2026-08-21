# Pub Limit Scrubber

A MERN app for scrubbing publisher lead files against two rate-limited buyer
APIs (LM and HC). Each publisher has its own admin-set daily limit, split
50/50 between the two buyers when scrubbing, and a global daily capacity
ceiling caps the sum of every active publisher's limit. Includes an admin
dashboard for managing limits and reviewing scrub history.

## How it works

1. A publisher visits the site and enters their publisher name. This is
   validated against the admin-managed publisher list before they can move
   on — an unrecognized or disabled name is blocked right there with a clear
   error, and never reaches the upload step. Once validated, they see their
   own admin-set daily limit and how many leads they can still scrub today.
2. They upload a CSV lead file (any size — files are streamed, not loaded
   into memory; comma- or semicolon-delimited files are both auto-detected).
   Column headers are matched automatically regardless of case, spacing,
   underscores, or hyphens (`phoneUtils.PHONE_HEADER_CANDIDATES`,
   `STATE_HEADER_CANDIDATES`, served via `GET /api/scrub/upload-requirements`
   so the UI can't drift out of sync with the actual parser). A state
   column is recommended (2-letter code or full state name, any case —
   "AZ", "az", and "Arizona" all work), used per-lead for the HC buyer
   call — if it's missing or blank for a row, the state is automatically
   derived from that phone's own area code instead
   (`phoneUtils.deriveStateFromAreaCode`), so a file with no state column
   at all still gets fully scrubbed. The server reads the file once to
   find every **unique, valid US phone number** (any common format —
   dashes, parens, dots, a leading country code, or a trailing extension
   are all handled), in the order they first appear. Non-US-format phones
   are marked invalid and never sent to the
   buyer APIs.
3. There's no upfront pool reservation — every unique phone in the file is
   attempted. Capacity is enforced live, per publisher (see "Limits: a
   daily limit per publisher, split 50/50" below).
4. Before either buyer sees a single phone, every unique phone is checked
   against our own internal duplicate/DNC service first (see "Internal DNC
   check" below). Anything it flags as a duplicate is marked `DNC` right
   there and never sent to LM or HC at all; only the phones it clears go on
   to the buyer split.
6. LM and HC both scrub against the same underlying suppression data, so
   checking a phone against both would be redundant. Instead, the unique,
   non-DNC phones are **split roughly in half** (first half → buyer1/LM,
   second half → buyer2/HC, in first-occurrence order — e.g. 90,000 phones
   become 45,000 to each buyer) and both halves are processed
   **concurrently**, each throttled to an admin-configurable target rate
   (default 1000 requests/minute per buyer, see "Scrub speed" below) — so
   total throughput is double the per-buyer rate, not the rate itself. A
   publisher's own daily limit is split the same way (a 100,000 limit means
   50,000 checks against each buyer); once a publisher has used up its half
   from a buyer today, any phone still routed to that buyer is left `Not
   Checked` rather than redirected to the other buyer.
7. The server writes the **original file back out unchanged**, with columns
   appended: `NormalizedPhone`, `ScrubStatus` (`Processed`, `Duplicate In
   File`, or `Invalid Phone`), `BuyerAssigned` (`Buyer 1` or `Buyer 2`, blank
   for a phone that never reached a buyer — an anonymized, fixed mapping;
   buyer1 = LM, buyer2 = HC — the output file and the publisher-facing UI
   never name the real buyers), `BuyerStatus` (`Available`, `Blocked`,
   `Error`, `Not Checked` if that publisher's allotment from that buyer was
   already used up today, or `DNC` if the internal duplicate check caught it
   before either buyer), and `BuyerMessage`. Since each phone is checked by
   at most one buyer, there's a single status/message pair per row, not one
   per buyer. No original data is ever lost.
8. The publisher can leave the tab — the upload page polls job status and
   shows an ETA based on the current combined buyer rate. A shareable
   `/status/:jobId` link is also shown so they can check back later.
9. Every publisher's usage resets at midnight **America/New_York**
   (configurable) — usage is tracked per calendar day in that timezone, so
   nothing needs a cron job to "reset".
10. Admins log in to `/admin` to add publishers with their own daily limit,
    edit any publisher's limit later, enable/disable publishers, set the
    global daily capacity ceiling (validated so the sum of active
    publishers' limits can never exceed it), toggle scrub speed and its
    target rate (see "Scrub speed" below), and browse every scrub job with
    full stats (including internal DNC and per-buyer blocked counts), a
    download link, and a delete action (removes the job record plus its
    input/output files; blocked while a job is still queued or in
    progress).

## Stack

- **MongoDB** (Mongoose) — publishers (with their own daily limit), global
  capacity config, per-publisher-per-buyer usage counters, scrub job
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
    models/       Publisher (with dailyLimit), GlobalConfig, BuyerUsage,
                  ScrubJob
    constants/    buyer registry (LM/HC keys, buyer1/buyer2 mapping)
    services/     phone normalization, buyer API client, per-publisher
                  50/50 buyer-limit reservation and capacity validation,
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
  with an `x-vendor-api-key: {HC_VENDOR_API_KEY}` header — omitting it
  fails every call with `401 Unauthorized`. `state` is that lead's state
  from the CSV (abbreviation or full name, any case) or, if the row has no
  state value, the state derived from the phone's own area code (see
  `phoneUtils.deriveStateFromAreaCode` / `data/areaCodeToState.js`).
  Duplicate/suppression is read solely from the response's
  `phs_suppressed` field (`true` means blocked) — the capacity/routing
  fields in the same response (`accept`, `status`, `agents`, etc.) are
  informational only and don't affect the scrub result. A lead is only
  recorded as `Error` for HC (without calling the API, and without
  spending HC's daily quota) when NEITHER the CSV nor the area code yields
  a state — e.g. a toll-free number, which isn't tied to any state.

Network/API errors are recorded as `Error` for that phone rather than
failing the whole job.

Output columns and the publisher-facing summary only ever refer to
`Buyer 1`/`Buyer 2` (buyer1 = LM, buyer2 = HC, fixed) — publishers never
see which real buyer checked a given phone.

## Internal DNC check (runs before either buyer)

Every unique phone is checked against our own internal duplicate/DNC
service first, configured via `INTERNAL_DNC_API_URL` (default
`http://91.108.112.198:3000/check-number`):

```
POST {INTERNAL_DNC_API_URL}
{ "phone": "(915)271-2882" }

→ { "success": true, "phone": "9152712882", "status": "Not Duplicate" }
```

Any response where `status` isn't exactly `"Not Duplicate"` (or where the
request errors/times out — see below) is treated as a duplicate: that
phone is marked `DNC` in the output file and **never sent to LM or HC at
all**, so it doesn't count against the publisher's daily limit or either
buyer's quota. Only phones this check clears go on to the buyer split.

This is our own service, not a third-party API with a rate limit, so it's
never throttled — `INTERNAL_DNC_CONCURRENCY` (default 100) just caps how
many requests are in flight at once so a huge file doesn't open thousands
of sockets simultaneously.

If the internal service itself is unreachable or errors, that individual
phone **fails open** — it's treated as not a duplicate and still goes on
to the buyer split — rather than blocking or mis-flagging real leads over
a network blip on our own side. This is logged server-side for visibility.

## Scrub speed: rate limited vs. as fast as possible

A single global toggle in the admin dashboard (Overview tab) controls how
aggressively both buyers' pacing loops run:

- **Rate limited (default, ON)** — each buyer processes
  `BUYER_API_CONCURRENCY` phones (default 20) per batch, with the delay
  between batches computed from an admin-configurable target rate
  (`rateLimitPerMinute`, stored in the DB, default 1000/min per buyer —
  2000/min combined). The same "Scrub speed" card that has the toggle also
  lets the admin type a custom rate or pick a preset (1,000 / 2,000 / 3,000
  / 5,000 per minute); changing it takes effect for the next job without a
  restart. `BUYER_API_CONCURRENCY` only caps the batch size, not the rate —
  raising the target rate shrinks the delay between batches rather than
  growing how many requests go out at once.
- **As fast as possible (OFF)** — each buyer instead batches
  `FAST_MODE_CONCURRENCY` phones (default 200) at a time with **no delay**
  between batches, so phones are scrubbed as quickly as the buyer APIs and
  network allow rather than at a fixed rate. There's no meaningful "leads
  per minute" number to report in this mode — the publisher-facing job
  status shows "as fast as possible" instead of a numeric ETA.

Regardless of which mode is active, if either buyer responds with `429 Too
Many Requests`, that buyer's loop pauses for a randomized 3-4 seconds
before its next batch (independent of the other buyer) rather than
continuing to hammer an API that just asked to slow down. The phone(s)
that received the 429 are recorded as `Error` for that buyer; there's no
automatic retry of that specific phone.

The toggle and rate apply to jobs that start after they're changed — a job
already running keeps whichever settings it started with (each `ScrubJob`
records a snapshot of `rateLimitEnabled` and `rateLimitPerMinute` at the
time it began processing).

## Limits: a daily limit per publisher, split 50/50

There's no shared "pool" of leads consumed as jobs run. Instead:

- **Each publisher has its own admin-set daily limit** (e.g. 100,000, or
  500,000 - whatever an admin sets when adding or editing that publisher).
  It's independent of every other publisher's limit - Publisher A using
  its full 500,000 doesn't take anything away from Publisher B's own
  100,000.
- **That limit is split 50/50 between the two buyers when scrubbing.** A
  100,000-limit publisher gets 50,000 checks against LM and 50,000 against
  HC per day; a 500,000-limit publisher gets 250,000 against each. (On an
  odd limit, LM gets the extra one, e.g. 99,999 → 50,000 LM / 49,999 HC.)
  Once a publisher has used up its half from a buyer for the day, any
  phone still routed to that buyer is left `Not Checked` rather than
  redirected to the other buyer.
- **The global daily limit is a capacity-planning ceiling, not a live
  usage counter.** The sum of every *active* publisher's own daily limit
  must never exceed it. E.g. with a 1,000,000 global limit, publishers
  with limits of 500,000 and 100,000 are fine (600,000 committed,
  400,000 of headroom left for more publishers or higher limits).
  Creating a publisher, raising a publisher's limit, or lowering the
  global limit are all validated against this and rejected with a clear
  error if they'd overcommit it - but *lowering* a publisher's limit or
  *raising* the global limit are always allowed, since neither can ever
  make an over-committed state worse (this matters if the system is ever
  already over the ceiling for some other reason - it guarantees there's
  always a way out via either lever).
- The admin dashboard's publisher table shows each publisher's total usage
  today plus a per-buyer breakdown (their limit's 50/50 halves and how
  much of each has been used) for visibility - only the top-level daily
  limit is actually editable per publisher.

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

On first boot there are no publishers — sign in to `/admin`, review the
global capacity ceiling (defaults to 1,000,000), and add publishers with
their own daily limit before anyone can upload a file for them.

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
- `HC_VENDOR_API_KEY` — required for HC; sent as the `x-vendor-api-key`
  header on every HC call. Missing or wrong values fail with `401
  Unauthorized`. Never commit the real value - it belongs only in your
  actual (gitignored) `server/.env`.
- `INTERNAL_DNC_API_URL` / `INTERNAL_DNC_API_TIMEOUT_MS` /
  `INTERNAL_DNC_CONCURRENCY` — our own duplicate/DNC pre-check that every
  phone goes through before either buyer, see "Internal DNC check" above.
  Not rate-limited; the concurrency setting only caps in-flight requests.
- Publisher daily limits are **not** env vars - each is set per publisher
  from the admin dashboard's Publishers tab (split 50/50 between buyers
  automatically at scrub time).
- `BUYER_API_CONCURRENCY` — batch size used in rate-limited mode (default
  20). The target rate itself (default 1000/min per buyer) is **not** an
  env var - it's a DB setting (`rateLimitPerMinute`) editable from the
  admin dashboard's "Scrub speed" card, see above.
- `FAST_MODE_CONCURRENCY` — batch size used when rate-limited mode is
  toggled off in the admin dashboard (default 200, no delay between
  batches). Whether rate limiting is on or off, and the target rate, are
  both DB settings, not env vars - see "Scrub speed" above.
- `DEFAULT_TOTAL_DAILY_LIMIT` — seed value for the global capacity ceiling
  (1,000,000), applied on first boot only and editable from the admin
  dashboard afterward.
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
  publisher's daily limit for each buyer - an accepted tradeoff for not
  needing to persist partial per-phone results.
- Schema changes that alter a unique index (e.g. adding `publisherId` to
  `BuyerUsage`'s uniqueness constraint) don't retroactively drop the old
  index in an already-running database - Mongoose's default `autoIndex`
  only ever creates missing indexes. `config/db.js` calls `syncIndexes()`
  on every model at startup specifically to handle this.
