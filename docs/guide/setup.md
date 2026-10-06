# Setup

## What you need

| | |
|---|---|
| Node.js | 22 or newer (`.nvmrc` is not used; the version is pinned in `package.json` under `engines`) |
| pnpm | 9 or newer |
| A CrydenSync API | only if you want to sign in. See [Running against a real API](#running-against-a-real-api) |
| A database | optional. With none configured, the console uses a SQLite file under the working directory |

You do not need Docker, Postgres or the Go toolchain to look at the console.

## Install and boot

```bash
git clone <this repository>
cd csaxplus
pnpm install
cp .env.example .env.local
```

Then generate the two keys `.env.local` asks for:

```bash
openssl rand -base64 32   # CSAX_SESSION_SECRET
openssl rand -base64 32   # CSAX_VAULT_KEY
```

Each has to decode to exactly 32 bytes. The loader checks that and refuses to boot otherwise, so a
truncated paste is caught at startup rather than at the first sign-in.

Set `CSAX_API_URL` to wherever your API lives and start the server:

```bash
pnpm dev
```

Open <http://localhost:3000>.

## The two modes

`CRYDEN_MODE` decides which API adapter the console builds, and there are exactly two.

### `fixtures` (offline)

The console boots, the landing page and the design system render, and the topbar's connection tag
reads `fixtures`. Every screen that shows data says the data is not real.

**You cannot sign in.** Sign-in is a real call to a real API, and the fixtures adapter has no
adapter for it. That is deliberate rather than unfinished: a console that let you sign in to sample
data would be teaching you the wrong thing about what it does with your credentials.

Use this mode to work on the design system, the landing page, or a screen's empty and error states.

### `live`

The console calls `CSAX_API_URL` for everything. A call that fails stays a failure: the mode does
not fall back to fixtures, and no screen silently substitutes sample data for an answer it did not
get.

## Running against a real API

1. **Stand up the API.** From [`crydensync/api`](https://github.com/crydensync/api), set
   `DATABASE_URL` or `SQLITE_PATH` (exactly one), then:
   ```bash
   api migrate
   ```
2. **Make yourself an operator.** The console cannot create one; that is deliberate, since a
   console that can mint its own first administrator is a console reachable from the internet.
   ```bash
   go run ./cmd/grant-operator -db "$DATABASE_URL" -email "$OPERATOR_EMAIL"
   ```
   `-role` defaults to `admin`. `-revoke` removes the grant. This is also the break-glass path if
   every operator loses their second factor.
3. **Point the console at it.**
   ```
   CSAX_API_URL=http://127.0.0.1:8080
   CRYDEN_MODE=live
   ```
4. **Check the origin matches.** `WEBAUTHN_ORIGIN` must be the origin you actually browse to.
   `http://localhost:3000` and `http://127.0.0.1:3000` are different origins, and the route
   handlers refuse a request whose `Origin` is not the configured one. Browsing to the other name
   is a refused sign-in rather than a convenience, because that is what WebAuthn requires.
5. `pnpm dev`, then sign in with that operator's address and password.

## The console's own store

The console keeps a small database of its own: step-up passkeys, vault secrets, console audit
entries and UI preferences. It is **not** the engine's database and must not share credentials with
it.

Pick one:

```
CSAX_STORE_URL=postgres://<console-user>:<password>@<host>:5432/<console-database>
```
or
```
CSAX_STORE_SQLITE_PATH=./.csaxplus/console.sqlite
```

Setting both is a boot error rather than a coin toss. Setting neither falls back to
`.csaxplus/console.sqlite` under the working directory, which is what lets a fresh checkout run
without a database. That file is gitignored.

Migrations run automatically at boot unless `SKIP_AUTO_MIGRATE` is set. A store the console cannot
open stops the process with a readable message rather than surfacing later on whichever screen
touches it first.

Both engines are supported and both are exercised by `pnpm test`. The Postgres path runs against a
real Postgres in the suite: PGlite behind `@electric-sql/pglite-socket`, a development dependency
that serves the wire protocol over TCP, so the driver under test is the one a deployment uses. The
built server has been booted against it too, which is where the boot line
`csax+ store ready on postgres, applied 0001` comes from. What that means for you is that a first
Postgres deployment should not be the first time this code runs.

## Running the checks

```bash
pnpm lint
pnpm typecheck
pnpm test          # vitest, unit tests
pnpm test:e2e      # playwright; starts a dev server if one is not already up
```

The e2e suite needs a Chromium that Playwright manages:

```bash
pnpm exec playwright install chromium
```

It downloads about 120 MB, once, into `~/.cache/ms-playwright`. A fresh machine and a CI runner
both need that command.

`pnpm screenshots` regenerates the images in `docs/guide/screenshots/`. It is a separate Playwright
configuration on purpose, so a gate run never rewrites a committed image. It pins `CRYDEN_MODE=live`
itself: the console images are of the live adapter, and the checkout's own default of `fixtures`
would tag the health check as fixtures while the dashboard's reports, which have no fixtures
implementation, still said the API was unreachable.

Set `CSAX_SCREENSHOT_EMAIL` and `CSAX_SCREENSHOT_PASSWORD` first to have the console images taken
from a real sign-in, which is how the committed ones were made. Without them the run mints a session
cookie carrying placeholder API tokens, which still photographs a signed-in shell but shows every
API-backed report as unreachable. Put the credentials in the gitignored `.env.local`, not in a
script.

## When it will not start

The console validates everything at boot and stops with every problem at once, without printing any
value. The output looks like this:

```
csax+ cannot start.
Configuration is not usable, 5 problems:
  CSAX_API_URL: expected string
  CSAX_SESSION_SECRET: expected string
  CSAX_VAULT_KEY: expected string
  and 2 more
See .env.example for every setting, its resolution order and a safe placeholder.
```

At most three problems are listed and the rest are counted, because a wall of text is harder to act
on than a list you can work down. Four failures cover almost all of it.

**`CSAX_API_URL: expected string`.** Nothing set it. The loader looks at the environment, then
`CSAX_API_URL_FILE`, then `csax.config.json`, then a default, and there is no default for this one.
A blank value falls through to the next source, so `CSAX_API_URL=` in a `.env` file counts as unset.

**`CSAX_SESSION_SECRET: must be 32 bytes, base64 encoded (session cookie signing)`.** Usually a
truncated paste, or a passphrase where random bytes were expected. `openssl rand -base64 32`
produces exactly one. The same check guards `CSAX_VAULT_KEY`.

**`csax+ cannot start: the console store is not usable.`** The path in `CSAX_STORE_SQLITE_PATH` is
not writable, or the Postgres in `CSAX_STORE_URL` is not reachable. The line under it names which.

**`CSAX_STORE_URL: cannot be set together with CSAX_STORE_SQLITE_PATH, pick one`.** Both were set.
They are two answers to the same question and the console will not guess which you meant.

## Troubleshooting a sign-in that will not happen

- **The tag says `offline`.** The console could not reach `CSAX_API_URL` at all. Check the API is
  listening and that the URL includes the port.
- **The tag says `degraded`, and the sentence mentions `db_unreachable`.** The API is up and says
  its own database is not. Sign-in will fail until that is fixed.
- **The sign-in is refused with an origin error.** You are browsing a different name for the same
  server than `WEBAUTHN_ORIGIN` says. Use the configured one.
- **A passkey prompt never appears.** The ceremony needs a secure context: HTTPS, or `localhost`
  exactly. `127.0.0.1` counts as a secure context in browsers, but here it is a different origin
  from the configured one, so the first bullet applies instead.
