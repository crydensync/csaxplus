# Changelog

Notable changes to csax+, newest first.

The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows
[Conventional Commits](https://www.conventionalcommits.org/), so every entry below corresponds to
a commit prefix you can search the history for: `feat`, `fix`, `docs`, `chore`.

Entries are written by hand from the commit history. The changelog generator and the CI that would
run it arrive in step 5.6; until then a hand-written file is the honest version, since a generated
one would need a toolchain this repository does not have yet.

## [Unreleased]

To be tagged `v0.0.1` at the end of tier 0. Tier 0 uses the `v0.0.x` line; the numbered tiers
start at `v0.1.0` (BUILD_NOTE section 6).

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
