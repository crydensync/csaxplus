# Changelog

Notable changes to csax+, newest first.

The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows
[Conventional Commits](https://www.conventionalcommits.org/), so every entry below corresponds to
a commit prefix you can search the history for: `feat`, `fix`, `docs`, `chore`.

Entries are written by hand from the commit history. The changelog generator and the CI that would
run it arrive in step 5.6; until then a hand-written file is the honest version, since a generated
one would need a toolchain this repository does not have yet.

## [Unreleased]

To be tagged `v0.1.0`, which closes tier 1. Tier 0 used the `v0.0.x` line; the numbered tiers start
at `v0.1.0` (BUILD_NOTE section 6).

### Added

- **A real dashboard.** The screen that stood in for one in tier 0 is replaced by the four reports
  the API can actually answer: the account total and the newest accounts from `GET /v1/admin/users`,
  second-factor enrolments and removals from `/v1/admin/security/mfa-adoption`, the configured
  hasher and what is left to upgrade from `/v1/admin/security/hash-migration`, and the latest stored
  digest from `/v1/admin/digest/history`. Each report carries its own loading, empty, refused and
  failed state, so one unanswered report does not blank the three that arrived.
- **`GET /api/console/dashboard`**, the console route that reads those four. It exists so the API
  access token can be renewed on a screen's own call: only a route handler can write the cookie a
  renewal sets. See DECISIONS.md D18.
- **A state per reason, not per status.** `not_implemented_on_sqlite` becomes "this deployment has
  no admin surface", `not_operator` becomes "this account is not a console operator", and a
  `not_configured` report says which setting is missing. Only a genuine failure offers a retry. When
  every report comes back with the same answer, the screen draws that answer once instead of in all
  six places it would otherwise appear.

## [0.0.2] - 2026-10-04

Tier 0 follow-up: the Postgres half of the console store now runs, and two defects it was hiding are
fixed. Nothing on screen changed.

### Fixed

- **The console store could not open on Postgres.** `openPostgresStore` read the postgres.js factory
  from `pg.default`, which is undefined: the package is `export = postgres`, so the build this code
  reaches returns the factory itself. On Postgres this fired at boot, before a single request.
- **A `Date` parameter crashed the Postgres driver.** Drizzle's `postgres-js` driver replaces the
  serializers for the date and timestamp type OIDs with a pass-through, so postgres.js no longer
  encodes a `Date` and the value reached the wire unencoded. The driver now sends the ISO 8601 string
  Postgres expects, which is what drizzle sends for its own timestamp columns.

Both were found by executing the Postgres path for the first time. See DECISIONS.md D17.

### Added

- **The Postgres store runs in the test suite**, against a real Postgres: PGlite behind
  `@electric-sql/pglite-socket`, both development dependencies, serving the wire protocol over TCP to
  the shipped `openPostgresStore`. The built server was booted against it as well.

## [0.0.1] - 2026-10-04

Tier 0: the foundation. The console boots, signs an operator in against a real API, and holds no
stand-in behaviour beyond the two pieces named under Notes.

### Added

- **The landing page** at `/`, as a real route rather than a static file. It is the only statically
  rendered route in the app: it reads no cookie and calls no API, so a signed-out visitor and a
  signed-in operator get the same bytes. Its console map is generated from the console's own
  navigation, which means the marketing list cannot drift from the sidebar, and its claims were
  reconciled against the Go source before they were ported.
- **The console's navigation**, six groups and 21 screens, with a `readOnly` flag on the four AI
  screens so the invariant has one source rather than a label typed onto each screen.
- **A typed client for the CrydenSync API**, with a live adapter and a labelled fixtures adapter
  chosen by `CRYDEN_MODE` alone. Fixtures are never a fallback for a call that failed.
- **A real connection tag in the topbar**: `api-client`, `degraded`, `fixtures` or `offline`, each
  produced by an actual answer from the API or by configuration that admits no call was made. It
  is a server component with no cache, so it cannot describe a connection that is already gone.
- **Operator sign-in against the API**: `POST /v1/login` plus the paused-login completions
  (`/v1/login/totp`, `/v1/login/recovery-code`, `/v1/login/passkey/begin|finish`) and
  `/v1/refresh`, with roles, CSRF on every mutation, and an encrypted session cookie carrying the
  API's tokens where the browser cannot read them.
- **The console's own store**, with migrations for Postgres and SQLite from one schema and
  automatic migration on boot unless `SKIP_AUTO_MIGRATE` is set.
- **Configuration loading** from the environment, a `_FILE` indirection, or a JSON config file, with
  every problem reported at once and no value ever printed. A misconfigured deployment stops at boot
  instead of failing on whichever screen touches the setting first.
- **The design system**, ported from the prototype's token stylesheet: Card, Pill, Toggle, Button,
  DataTable, Modal, Toast, Sidebar, Topbar, EmptyState, ErrorState and Skeleton, with a dev-only
  gallery at `/design` for checking every component in every state.
- **Documentation**: this file, the README, SECURITY.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, the
  guide under `docs/guide/`, and the build notes under `docs/build/`.

### Notes

- Every one of the 21 console screens beyond the dashboard shell is still to be built, and each
  says so on screen rather than showing stand-in data. See the feature table in the README.
- There is no CI badge in the README, and the workflow it would point at arrives in step 5.6. A
  badge resolving to nothing is the kind of small untrue thing this project avoids.
