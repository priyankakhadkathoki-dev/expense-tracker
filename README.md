# Galla Shop Ledger

A small web app for shop owners to record daily income and expenses and see how the business is doing. Recording a day takes under two minutes: income, category, expense, category, note, save.

Built as plain HTML, CSS and JavaScript with [Supabase](https://supabase.com) for the database, sign-in and row level security. There is no build step.

## Pages

Login / Sign up, Shop setup, Dashboard, Record today, Daily income, Daily expenses, Categories, Goals, History & reports, Profile & settings.

## Run it

Open `index.html` in a browser, or serve the folder with any static host (GitHub Pages, Netlify, Vercel).

The Supabase project URL and anon key are at the top of `app.js`. The anon key is meant to be public; the data is protected by row level security. Never put the service role key or the database password in this repository.

Email confirmation is on in the Supabase project. When you host the app, set **Authentication → URL Configuration → Site URL** in Supabase to the hosted address so the confirmation link returns to the app.

## Project layout

| Path | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The app |
| `supabase/migrations/0001_init.sql` | Tables, triggers and row level security policies |
| `supabase/tests/` | SQL tests for the security rules (local Postgres) |
| `tests/` | Browser tests that drive the app with a stand-in for Supabase |

## Database

Five tables: `profiles`, `shops`, `categories`, `entries`, `goals`. Income and expenses share `entries`, told apart by a `kind` column, and their categories share `categories` the same way. A signed-in user can only read and write their own profile, shop and that shop's rows.

To set up a new Supabase project, run `supabase/migrations/0001_init.sql` in the SQL Editor.

## Tests

Browser tests (needs Node):

```
npm install
npx playwright install chromium
npm test
```

Security tests against a local Postgres 15+:

```
psql -d galla -f supabase/tests/00_local_supabase_stub.sql -f supabase/migrations/0001_init.sql
psql -d galla -f supabase/tests/01_rls_test.sql
```

`00_local_supabase_stub.sql` is for local testing only. Do not run it on Supabase.
