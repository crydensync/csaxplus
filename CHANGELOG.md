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
- **A Users screen.** Every account the API knows, read through `GET /api/console/users`, with
  server-side paging and an exact-address search, a row that opens a detail drawer, and the fields
  the API actually sends: Account, Created, Last change, Failed attempts and Status. The prototype's
  Provider, MFA and Last seen columns have no endpoint behind them and are not rendered, since an
  empty cell reads as an account with no provider rather than as a console that cannot know. See
  DECISIONS.md D19 and BACKEND_GAPS section 5. The account actions (create, suspend, force-disable
  MFA, revoke sessions, unlink an OAuth provider) need six endpoints the API does not have yet and
  follow once they exist.
- **`GET /api/console/users` and `GET /api/console/users/{id}`**, the console routes behind that
  screen. The detail route reads the account and its metadata together and answers a state for each,
  so a deployment with no metadata store still shows the account.
- **A drawer, and overlays that render into the document body.** `Drawer` shares the modal's
  keyboard contract. Both now render through a portal into `document.body`, because `position:
  fixed` is resolved against the nearest transformed ancestor and every console screen animates one:
  the drawer was sized to the content column instead of the window. See DECISIONS.md D20.
- **An honest search.** The API's `email` parameter is an exact, case-sensitive match, so the pager
  names the mode the API reported and a miss is worded as a search that found nothing rather than as
  an account that is gone.
- **Step-up passkeys, and the Account screen that manages them.** The API has no step-up check, so
  the console keeps its own: WebAuthn credentials in the console store, a ceremony, and a
  short-lived single-use grant that a gated route spends. `/account` lists the operator's passkeys
  and registers and removes them; the first passkey needs no step-up, because there would be nothing
  to step up with, and every one after that and every removal does. The screen is reached from the
  operator chip at the foot of the sidebar rather than from a nav item, so the sidebar keeps the 21
  screens the landing page reports. See DECISIONS.md D21.
- **Five console routes behind it**: `POST /api/console/passkeys/options` and `GET`/`POST
  /api/console/passkeys`, `DELETE /api/console/passkeys/{id}`, and `POST
  /api/console/step-up/options` and `/verify`. A removal that would leave the operator with none is
  refused with a conflict rather than a 404, and the screen disables the control that would ask for
  it.
- **The console store's first repositories.** Passkeys, challenges and grants, written once and run
  on both engines, with `tests/unit/store-repositories.test.ts` executing the same suite against
  SQLite and against Postgres through PGlite. Nothing had queried the console store before this
  step.
- **An end-to-end test that drives a real ceremony.** `tests/e2e/step-up.spec.ts` attaches
  Chromium's virtual authenticator over CDP, so the WebAuthn calls are real: the test registers two
  passkeys on two devices, asserts that the second one really did go through a step-up request
  rather than quietly succeeding, removes one, and checks the last-one refusal. It signs in by
  minting the console's own sealed cookie from `.env`, since the sign-in screen needs an API that
  cannot be reached from a test.

### Fixed

- **Every call the Account screen makes now carries the session's CSRF token.** `src/lib/stepup.ts`
  reached the four routes that run the mutation guard without the `x-csrf-token` header, so every
  gated call would have been refused with "your session token is missing or stale" and the feature
  would not have worked at all. The unit tests call the route handlers directly with hand-built
  requests and passed throughout; the end-to-end test is what found it. The header name now lives in
  `src/lib/csrf-header.ts`, imported by both halves, rather than being spelled out in each.

- **Registering a passkey no longer lets a viewer through.** The role and CSRF checks sat behind
  `held > 0`, on the reasoning that the first passkey has nothing to step up with. The grant is what
  the first passkey is exempt from, not the permission: a viewer holds no passkey, so a viewer never
  reached the checks and could enrol one. The guard is now split, and
  `tests/unit/stepup-gate.test.ts` holds both the ungated role check and the ungated origin check.

- **A passkey registration that the authenticator refuses to duplicate says so.** A platform
  authenticator holds one credential per account and raises `InvalidStateError` rather than
  enrolling the same account twice. The client counted that as a cancellation and told the operator
  "that was cancelled, so no passkey was added", which is the opposite of what happened and would
  have sent them round again to fail identically.

### Changed

- **The way to the Account screen is the sidebar's operator chip, not a topbar button.** The chip
  already shows the address and the role; making it the link to the screen that manages the session
  puts the two facts and the place they are acted on together, and leaves the topbar's actions for
  things that act on the screen in front of you.
- **The whole tree is formatted with Prettier.** `pnpm format:check` had been failing on 21 files,
  and nothing noticed because the verification gate is lint, typecheck and test: `format:check` was
  never in the loop, and the step 5.6 CI would have been the first thing to run it. The drift is old
  (`src/lib/api-status.ts` was already unformatted at its birth commit in tier 0), so it is not
  something a recent step introduced. Formatting only, with one change worth naming: a two-line
  `radial-gradient` in `globals.css` is joined onto one line, which is the same value list separated
  by a comma.

### Fixed

- **The landing page's sign-in redirect test could fail on its own timeout.** Its assertion waits 60
  seconds for the console group's first compile, but the test-level default stopped the test at 30,
  so the assertion's own timeout was unreachable and a slow recompile lost the race instead of being
  waited out. The test is now marked slow, which gives it 90 seconds, and was seen passing at 24
  seconds on a cold server.

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
