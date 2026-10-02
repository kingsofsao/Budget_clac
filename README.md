# Trip Split

A group expense-splitting web app for friends on outings and trips, from a single day out to a multi-day trip. Record who paid for what and who took part, and Trip Split works out:

- total trip spending, by category, person and day
- each person's total paid, actual share, and net balance ("Should receive" / "Should pay" / "Settled")
- a short list of suggested payments: **who should pay whom, and how much**

> **Trip Split never touches money.** It has no payment gateway, UPI, bank, card or wallet integration, and stores no financial account details. People settle up however they like, outside the app. Every settlement figure is informational only.

---

## Features

| Area     | What's included                                                                                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Trips    | Create single-day or multi-day trips, edit details, delete (owner only), recent trips on the home page                                                                                           |
| Sharing  | Unguessable 8-character share code + link (e.g. `/trip/BGLDEMX2`), native share sheet, copy link / copy code, join screen                                                                        |
| People   | Guests need only a name (email optional). Members can link their account ("This is me"). Removing someone who appears in any expense is blocked, with an explanation                             |
| Expenses | Description, amount (₹, stored in paise), paid by, participants, category, date, notes. Payer may be excluded from the split. Equal or custom-amount splits. "Save & add another" for fast entry |
| History  | Expense list grouped by day; search; filters by category, payer, participant, date and amount range (kept in the URL); expense detail with every share; edit & delete with confirmation          |
| Balances | Paid / share / balance per person in plain language, a deterministic settlement plan, a live check that totals reconcile, and "Copy Settlement" for WhatsApp                                     |
| Summary  | Overview stats, category breakdown (chart + table, percentages always sum to 100%), spending by person, spending by day, settlement summary, "Copy Summary"                                      |
| Export   | CSV of all expenses, plain-text summary download                                                                                                                                                 |
| Activity | Feed of every change, e.g. "Gokul edited “Lunch” — ₹2,600 → ₹2,800"                                                                                                                              |
| Auth     | Instant anonymous guest sessions (no sign-up), email + password, magic link, optional Google. A guest can attach an email later and keep their trips                                             |
| UX       | Mobile-first with a thumb-reachable bottom bar and Add button, desktop tabs, dark mode, empty states everywhere, accessible dialogs, labelled forms, text alternatives for every chart           |
| PWA      | Installable (manifest + icons). The service worker caches static assets and recently viewed trip pages for poor signal; writes always need a connection                                          |

## Architecture

```
Browser (React 19 client components only where interactive)
   │  Server Actions (Zod-validated)           ▲ RSC HTML/payload
   ▼                                           │
Next.js 16 App Router on Vercel ── pure calculation engine (src/lib/calculations, integer paise)
   │  supabase-js as the signed-in user (anon key + user JWT; never the service-role key)
   ▼
Supabase
   ├─ Auth (anonymous, email/password, magic link, Google)
   ├─ PostgreSQL: tables are READ-ONLY to clients via RLS
   └─ SECURITY DEFINER functions: the only write path; validate + authorise + write in one transaction
```

**Where the numbers come from.** The database stores only facts: expenses and each participant's share in paise. Balances, settlements and summaries are never stored. They are derived on the server on every request by pure, unit-tested functions (`buildTripReport`). Editing or deleting an expense therefore updates everything immediately, and stale financial data is impossible.

**Defence in depth for money.**

1. Client form validation (shared `parseExpenseForm`) for instant feedback.
2. The server action re-parses the raw input, checks payer/participants belong to the trip, and **computes the shares itself**. Client-calculated amounts are never trusted.
3. The `save_expense` database function re-checks access, membership, dates, that shares sum to the amount, and that "equal" splits differ by at most one paisa.
4. Schema constraints: composite foreign keys keep payers and participants inside the same trip, and a **deferred constraint trigger** guarantees at commit time that every expense has ≥ 1 participant and its shares sum exactly to its amount.

### Money and rounding rules

- All money is an integer number of **paise** (`₹1,800 = 180000`). User input is parsed from the string straight to paise (`parseINR`); there is no float maths anywhere in the calculation path. Formatting to `₹1,800.50` (Indian digit grouping) happens only in the UI (`formatINR`). See `src/lib/money`.
- **Equal split:** everyone gets `floor(amount / n)`; the remaining `amount mod n` paise go one each to the **first participants in trip-member order** (the order people were added). E.g. ₹100 / 3 → ₹33.34, ₹33.33, ₹33.33. Shares always sum exactly to the amount.
- **Custom split:** shares must sum to the amount exactly or the expense can't be saved.
- **Percentages** in summaries use the largest-remainder method so they always add up to 100%.
- **Averages** shown in the UI are display-only and rounded to the nearest paisa.

### Settlement algorithm

`src/lib/calculations/settlements.ts`: greedy largest-debtor ↔ largest-creditor matching with deterministic tie-breaking (trip member order). Each person only pays or only receives, every non-zero balance is reconciled exactly, and it uses at most (people with a balance − 1) transfers. It is **not** guaranteed to be the global minimum (that problem is NP-hard), but it gives short, practical lists.

### Accounting invariants (tested)

1. Total paid by everyone = total trip expenses
2. Total of all shares = total trip expenses (and per expense)
3. Sum of all net balances = 0
4. Sum of "should receive" = sum of "should pay"
5. Applying the suggested transfers brings every balance to exactly 0

These are checked by 300 randomized trips in the unit tests, and live on the Balances page.

### Access model

- Every visitor gets an **anonymous Supabase session** the first time they create or join a trip, so RLS always has a user id while nobody is forced to sign up.
- A trip's share code is its invitation: anyone holding it can join (`join_trip`) and then read and edit that trip. Codes are 8 characters from a 32-symbol alphabet (~1.1 trillion combinations), generated with `gen_random_bytes`. Internal UUIDs are never used in URLs for trips.
- Only the creator (`owner`) can delete a trip. All members can add, edit or delete expenses and people. The activity feed records who did what.

## Tech stack

Next.js 16 (App Router, Server Components, Server Actions, Turbopack) · React 19 · TypeScript (strict) · Tailwind CSS v4 · shadcn-style components on Radix primitives · Lucide icons · React Hook Form · Zod 4 · Supabase (Postgres 17, Auth, RLS) · Vitest · Playwright · ESLint · Prettier.

## Project structure

```
src/
  app/                       routes (see below), manifest, icons, error/not-found/offline pages
  components/                shared UI (ui/ = button, form controls, dialogs)
  features/
    auth/                    sign-in, account upgrade, server actions
    trips/                   queries (data layer), trip actions, nav, join/invite/activity
    members/                 people actions + components
    expenses/                expense actions, form, list filters
    balances/ settlements/ summary/   presentation of computed results
  lib/
    money/                   integer-paise utilities (parse, format, split, validate)
    calculations/            pure engine: shares, balances, settlements, summaries, invariants
    validation/              Zod schemas shared by client and server
    supabase/                server/browser clients, proxy session refresh, generated types
    export.ts dates.ts categories.ts errors.ts utils.ts
  types/domain.ts
  proxy.ts                   refreshes the Supabase session cookie (Next 16 "proxy", formerly middleware)
supabase/
  migrations/                schema, RLS, functions
  seed.sql                   DEVELOPMENT ONLY demo data
tests/
  unit/                      Vitest: money, engine, invariants, Bangalore example, validation, exports
  db/security.sql            RLS / permission / integrity tests against the local database
  e2e/                       Playwright: full user flows on mobile + desktop
```

### Routes

| Route                                                     | Purpose                                             |
| --------------------------------------------------------- | --------------------------------------------------- |
| `/`                                                       | Home: create, open/join by code or link, your trips |
| `/create`                                                 | Create a trip                                       |
| `/login`, `/account`, `/auth/callback`                    | Sign-in, guest → account upgrade, auth redirects    |
| `/trip/[code]`                                            | Overview (join screen if you don't have access yet) |
| `/trip/[code]/people`                                     | People + invite                                     |
| `/trip/[code]/expenses`                                   | List, search & filters                              |
| `/trip/[code]/expenses/new`                               | Add expense                                         |
| `/trip/[code]/expenses/[id]` (`/edit`)                    | Expense detail / edit                               |
| `/trip/[code]/balances`                                   | Balances and suggested settlement                   |
| `/trip/[code]/summary`                                    | Trip summary and charts                             |
| `/trip/[code]/activity`, `/settings`                      | Activity feed, trip details / delete                |
| `/trip/[code]/export/expenses.csv`, `/export/summary.txt` | Downloads (access-checked)                          |

## Database schema

| Table                  | Key columns                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`             | `id` (= auth user), `display_name`                                                                                                                |
| `trips`                | `id`, `public_code` (unique, random), `name`, `description`, `start_date`, `end_date`, `created_by`                                               |
| `trip_access`          | (`trip_id`, `user_id`), `role` (`owner`/`member`), `last_accessed_at`                                                                             |
| `trip_members`         | `id`, `trip_id`, `user_id` (nullable: guests), `display_name` (unique per trip, case-insensitive), `email`, `color`, `position`                   |
| `expenses`             | `id`, `trip_id`, `description`, `amount_paise` (bigint > 0), `paid_by_member_id`, `category`, `split_method`, `expense_date`, `notes`, timestamps |
| `expense_participants` | (`expense_id`, `member_id`), `trip_id`, `share_paise` (bigint ≥ 0)                                                                                |
| `trip_activity`        | `trip_id`, `actor_name`, `action`, `subject`, `amount_paise`, `previous_amount_paise`                                                             |

RPC functions: `create_trip`, `get_trip_preview`, `join_trip`, `touch_trip`, `update_trip`, `delete_trip`, `add_member`, `update_member`, `remove_member`, `claim_member`, `save_expense`, `delete_expense`, `set_display_name`, `list_my_trips`. Split methods are a `check` constraint plus a branch in `calculateExpenseShares`. The engine already has an integer `splitByWeights`, so percentage or weighted splits need a new branch, a UI and a constraint value, but no engine rewrite.

## Local setup

Requirements: Node.js ≥ 20.9, Docker Desktop (for the local Supabase stack), and optionally `psql` for the database tests.

```bash
npm install
npx supabase start            # starts Postgres/Auth/API locally, applies migrations + seed
npx supabase status           # copy API URL and PUBLISHABLE_KEY (or ANON_KEY)
cp .env.example .env.local    # paste them into .env.local
npm run dev                   # http://localhost:3000
```

Open **http://localhost:3000/trip/BGLDEMX2** to see the seeded 13-person "Bangalore Trip [DEMO]".

### Environment variables

| Variable                         | Required | Where it comes from                                                                                                                                               |
| -------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`       | yes      | Local: `npx supabase status` (API URL). Prod: Supabase → Project Settings → API                                                                                   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | yes      | Local: `npx supabase status` (PUBLISHABLE_KEY/ANON_KEY). Prod: Supabase → Project Settings → API Keys. (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is also accepted.) |
| `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH` | no       | `true` only after enabling Google in Supabase Auth                                                                                                                |

Both Supabase values are public by design. **No secret keys are used by this app.** Never add the service-role key to the frontend or to Vercel.

### Database migrations

- Local: `npm run db:reset` re-creates the local database from `supabase/migrations` and loads `supabase/seed.sql`.
- Regenerate TypeScript types after schema changes: `npm run db:types`.
- Production: `npx supabase link --project-ref <ref>` then `npx supabase db push`. `db push` does **not** run `seed.sql`, so demo data never reaches production.

### Commands

| Command                       | What it does                                                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                 | Dev server                                                                                                                             |
| `npm run build` / `npm start` | Production build / serve                                                                                                               |
| `npm run typecheck`           | Generates route types and runs `tsc --noEmit`                                                                                          |
| `npm run lint`                | ESLint (Next core-web-vitals + TypeScript rules)                                                                                       |
| `npm run format`              | Prettier                                                                                                                               |
| `npm test`                    | Vitest unit tests (engine, money, invariants, validation, exports)                                                                     |
| `npm run verify:demo`         | Prints the full Bangalore breakdown and settlement                                                                                     |
| `npm run test:db`             | RLS, permission and integrity tests against the local DB (needs `psql`)                                                                |
| `npm run test:e2e`            | Playwright on mobile + desktop. Builds and serves on :3100 against local Supabase. Run `npm run db:reset` first for the demo-trip test |
| `npm run check`               | typecheck + lint + unit tests + build                                                                                                  |

## Deploying

### 1. Supabase (production project)

1. Create a project at supabase.com.
2. `npx supabase link --project-ref <project-ref>` then `npx supabase db push`.
3. **Authentication → Sign In / Providers:** enable **Anonymous sign-ins** (required for guest use) and **Email**. Optionally enable Google (create an OAuth client in Google Cloud and paste the client id/secret), then set `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=true`.
4. **Authentication → URL Configuration:** set Site URL to your production URL and add `https://<your-domain>/auth/callback` (and Vercel preview URLs if wanted, e.g. `https://*-<team>.vercel.app/**`) to Redirect URLs.
5. Recommended: enable CAPTCHA protection (Auth → Attack Protection) and review the anonymous sign-in rate limit to limit abuse.

### 2. Vercel

1. Import the Git repository in Vercel (framework preset: Next.js; no extra config needed).
2. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (and optionally `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH`) for Production and Preview.
3. Deploy. Security headers are set in `next.config.ts`; trip pages send `noindex`.

## Security notes

- RLS is enabled on every table. API roles can only `SELECT`, and only rows of trips they have joined. `INSERT/UPDATE/DELETE` privileges are revoked. All writes go through `SECURITY DEFINER` functions with `search_path = ''` that check `auth.uid()` membership first.
- Function execute rights are granted explicitly. Only `get_trip_preview` (name, dates, member count) is callable without a session.
- `tests/db/security.sql` proves: strangers can't read or modify another trip; direct table writes fail; unbalanced/empty/out-of-range/zero expenses are rejected; members referenced by expenses can't be removed; only owners delete trips; anonymous (no session) callers have no access; the integrity trigger rejects an expense without shares.
- Inputs are validated with Zod in every server action, and again in SQL.
- CSV exports neutralise spreadsheet formula injection. Export routes are access-checked and `no-store`.
- Auth callback redirects only to same-site relative paths.
- No secrets in the repo: `.env*` is git-ignored (only `.env.example` is committed).

## Known limitations

- **Share codes are bearer invitations.** Anyone with the link can join and edit. There is no per-member permission model or code rotation yet.
- A guest who clears browser data loses access to guest trips (they can rejoin with the code). Attaching an email from **Account** prevents this.
- Single currency (INR). No offline writes: adding/editing needs a connection (by design, to avoid sync conflicts). Cached pages may be slightly stale offline.
- No "mark as paid" tracking. Settlements are suggestions only.
- The greedy settlement is near-minimal, not provably minimal.
- No rate limiting beyond Supabase Auth's built-in limits.

## Future improvements

Percentage and weighted-share splits (engine support exists), receipt photos/OCR, multiple currencies, trip cloning and templates, optional manual "paid" status, expense comments, code rotation and member roles, notifications, CSV import, offline-first sync.
