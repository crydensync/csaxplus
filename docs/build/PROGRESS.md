# csax+ build progress

This file is how a new chat resumes the work. Read it first, continue from the first unchecked
item, and keep it current: tick a step after each commit, and rewrite the tier summary at the end
of every tier.

Stack: Next.js 15 (App Router) + TypeScript strict, pnpm, one global token stylesheet ported from
the prototype's `styles.css` plus React components (D1, no Tailwind and no CSS Modules), zod,
`@simplewebauthn/*`, jose, postgres/drizzle + better-sqlite3, vitest, playwright.

Architecture (brief section 11): `browser -> Next.js BFF -> api (/v1/*, /v1/admin/*) -> engine -> Postgres|SQLite`.
The console never holds the engine's primary credentials. Only `READONLY_DATABASE_URL` is an exception.

---

## Tier 0 - Foundation (tag v0.0.1)

- [x] 0.1 Init: pnpm workspace, Next.js 15 + TS strict, ESLint, Prettier, Vitest, Playwright,
      commitlint + `commit-msg` hook, `.claude/settings.json`, LICENSE (MIT), `.env.example`
- [x] 0.2 Design system: port `styles.css` tokens; Card, Pill, Toggle, Button, DataTable, Modal,
      Toast, Sidebar, Topbar, EmptyState, ErrorState, Skeleton
- [x] 0.3 Config loader (env, `*_FILE`, disk file, defaults) + boot-time fail-fast + `describeConfig()`
- [x] 0.4 Console store + migrations (Postgres/SQLite, same schema, two drivers), auto-migrate
      unless `SKIP_AUTO_MIGRATE`
- [x] 0.5 Operator auth: API-backed login (`/v1/login` + paused-login completions, `/v1/refresh`),
      roles owner/admin/viewer, CSRF, encrypted session cookie
- [x] 0.6 Cryden client interface + fixtures adapter + live adapter + health check;
      topbar tag reflects real state (`api-client` / `degraded` / `fixtures` / `offline`)
- [x] 0.7 Landing page ported from `landing.html` to a real route; accessibility fixed
- [x] 0.8 README.md, SECURITY.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, CHANGELOG.md,
      `docs/build/DECISIONS.md`, `docs/build/BACKEND_GAPS.md`; `docs/guide/` and Playwright
      screenshots
- [x] 0.9 Tag v0.0.1 and write the tier summary below

## Tier 1 - Identity (tag v0.1.0)

- [ ] 1.1 Dashboard: real counts, recent activity, digest card or empty state
- [ ] 1.2 Users: server-side search, pagination, detail drawer, actions with confirm + audit
- [ ] 1.3 OAuth Providers: real configured list, reachability checks (5 s timeout, cached)
- [ ] 1.4 MFA & Passkeys: real adoption stats; force-disable requires re-verification
- [ ] 1.5 Email & Magic Link: real delivery stats, SSR + sanitised template preview, send test
- [ ] 1.6 Password Policy: read/write real policy, stable violation codes, hash-migration bar
- [ ] 1.7 Tag v0.1.0 and write the tier summary below

## Tier 2 - Security (tag v0.2.0)

- [ ] 2.1 Sessions: real list, named devices, revoke one / revoke all, sidebar badge from real count
- [ ] 2.2 Anomalies: six signal codes + credential stuffing, "Mark reviewed" persists a note
- [ ] 2.3 Audit Log: filters (event, user, range), cursor pagination, CSV export (admin+)
- [ ] 2.4 Tag v0.2.0 and write the tier summary below

## Tier 3 - Developer (tag v0.3.0)

- [ ] 3.1 API Keys: create (shown once, hash stored), list with prefix + last used, revoke
- [ ] 3.2 Webhooks: CRUD, signing secret shown once, test delivery, delivery log
- [ ] 3.3 JWT Claims: editor refusing the seven registered claims, real preview token
- [ ] 3.4 Cloud Logging: provider toggles, vault-held credentials, real shipped events
- [ ] 3.5 Tag v0.3.0 and write the tier summary below

## Tier 4 - AI admin, read-only (tag v0.4.0)

- [ ] 4.1 `src/server/ai/`: allowlisted read-only query templates on `READONLY_DATABASE_URL` + test
- [ ] 4.2 AI Assistant modes (query, logs, anomalies scan, audit, ask) with citation chips
- [ ] 4.3 Weekly Digest: schedule, recipients, delivery, history
- [ ] 4.4 Support Assistant: scoped lookup, escalation, ticketing interface
- [ ] 4.5 Config Advisor: 30-day evidence, suggestions pre-fill a field, human saves
- [ ] 4.6 Ask-AI Widget: embeddable script, verified token, unconditional identity substitution,
      adversarial test suite
- [ ] 4.7 LLM Provider + Database Provider: real abstraction, usage counters, connection test
- [ ] 4.8 Tag v0.4.0 and write the tier summary below

## Tier 5 - Settings, Secrets, Deployment (tag v0.5.0)

- [ ] 5.1 Operators: invite, role change, remove, passkey management, operator sessions
- [ ] 5.2 Secrets: providers (env/file/vault), AES-256-GCM vault, masked list, step-up reveal,
      key rotation, audit
- [ ] 5.3 Config view (source of each setting, redacted)
- [ ] 5.4 SQLite mode: honest 501 state instead of broken screens
- [ ] 5.5 Hardening: CSP, security headers, rate limiting, lockout, /healthz, /readyz, JSON logs
- [ ] 5.6 Packaging: Dockerfile, docker-compose, Kubernetes manifest, GitHub Actions CI
- [ ] 5.7 Tag v0.5.0 and write the tier summary below
- [ ] 5.8 Tag v1.0.0 once the README, the docs and every gate are complete

---

## Working notes

- Reference repos are cloned read-only into `../_reference/cryden` and `../_reference/api`.
- No em dashes or en dashes anywhere. `tests/unit/no-forbidden-characters.test.ts` enforces this
  across every file we author, and the `commit-msg` hook rejects them in commit messages.
- No `Co-authored-by:` and no tool attribution in commits.
- Playwright's Chromium is installed at `~/.cache/ms-playwright` (one-time, ~120 MB). The e2e gate
  needs it; `pnpm exec playwright install chromium` restores it on a fresh machine. CI must run the
  same command, since `playwright.config.ts` uses the bundled browser and no system Chrome channel.
- `/design` is a dev-only preview of the component set. It 404s in a production build (D7).
- Configuration resolves in one order: environment, then `<KEY>_FILE`, then `csax.config.json`,
  then the default. Only JSON is parsed; TOML is refused rather than ignored (D8). `.env.local`
  holds this checkout's own values and is gitignored; `.env.example` carries placeholders only.
- The config loader reaches `fs` and `path` through `process.getBuiltinModule`, because a static
  `node:fs` import fails the edge compile of `instrumentation.ts` even behind a runtime guard. Do
  not reintroduce a `node:` import into anything the instrumentation graph touches.
- The same rule covers native packages: `better-sqlite3` and both drizzle driver entry points are
  loaded through `runtimeRequire` at call time (D9 item 4). An ordinary import of
  `drizzle-orm/better-sqlite3` breaks `next dev` with `Can't resolve 'fs'` while
  `/instrumentation` compiles.
- The console store defaults to `.csaxplus/console.sqlite` (gitignored). Boot on SQLite is verified
  in dev and against the built server, including the failure path: an unusable path prints a
  readable message and exits `1`.
- **Postgres is not executed anywhere in this checkout.** No server and no Docker daemon. Its
  migrations and queries are typechecked and compared structurally against the SQLite schema, never
  run. Every claim about the Postgres store has to be read that way until a Postgres exists;
  `@electric-sql/pglite` would run it in-process as a development dependency.
- Server processes started for a manual check outlive `timeout` when launched through `pnpm start`,
  because pnpm, `next start` and `next-server` are three processes. Launch
  `./node_modules/.bin/next start` directly so `timeout` reaches the server, and check for a
  leftover `next-server` afterwards.
- **Operator auth (step 0.5).** One encrypted cookie per concern, separated by jose audience:
  `csax_session` (8 h, `csaxplus.console`) and `csax_pending` (5 min, `csaxplus.pending`). Neither
  can be presented as the other, and a test holds that. The browser never sees a token: the cookie
  is `httpOnly`, and the CSRF value it needs comes from `GET /api/auth/session`.
- The API rotates the refresh token on every call and revokes the one it was given, so a renewal
  that is not written back signs the operator out on the next call. `requireSession` therefore
  returns the `Set-Cookie` alongside the session, and every early return in the mutation, CSRF,
  secrets and admin guards answers through `authorized.respond(...)`. A guard that returns its own
  `Response` and drops those cookies is a bug, not a style choice.
- Route handlers are pure `Request` to `Response` functions, with cookies read from and written to
  the raw headers rather than through `cookies()`. That is what makes them testable in vitest with
  no mocks; `next/headers` is used only for server components (`readSession`).
- The console holds no signing key. It decodes `sub`, `role` and `exp` to choose which screens to
  draw; the API verifies the same token on every real call and remains the authority. `role ===
  "admin"` is `admin`, anything else is `viewer`, and `owner` is unreachable until
  `GET /v1/admin/operators` exists (D10, BACKEND_GAPS 4.2).
- `POST /v1/login` returns no session id, so the console takes the newest from `GET /v1/sessions`
  right after signing in. When that cannot be read it records `apiSessionId: null` and signing out
  reports `revoked: false` instead of pretending. BACKEND_GAPS 4.1.
- Playwright's `baseURL` is `http://localhost:3000`, not `127.0.0.1`, because the route handlers
  refuse a request whose `Origin` is not `WEBAUTHN_ORIGIN`. The two names are different origins, so
  browsing to the other one is a refused sign-in by design, not a convenience to paper over.
- The e2e suite covers the signed-out path only: redirect to `/login`, both fields, focus on load,
  keyboard reach and focus rings, the 375 px layout, and a failed sign-in reporting itself in place
  without minting a cookie. **The success and second-factor paths are not covered end to end**,
  because the console calls the API server-side, so Playwright cannot intercept it, and the
  fixtures adapter does not exist until 0.6. With no API listening, the only reachable outcome is
  `api_unreachable`, which is what the spec pins down. The two-step walk itself is covered by
  `tests/unit/auth-flow.test.ts` (45 cases); the manual steps are a real API plus a real account.
- **The client and the tag (step 0.6).** `src/server/cryden/client.ts` is the interface;
  `fixtures.ts` and `health.ts` are the two adapters, chosen by `CRYDEN_MODE` alone. Fixtures are
  never a fallback for a failed live call: the failure stays a failure. `FixtureHealth` cannot be
  `api-client` and `LiveHealth` has no `fixtures` member, so neither adapter can claim the other's
  state even by mistake. See D12.
- The client is intentionally thin (`health()` only). Add one method per endpoint as a tier needs
  it. A client listing every `/v1/admin/*` route now would be guessing at shapes for screens that
  do not exist.
- `ConsoleTopbar` (`src/app/(console)/console-topbar.tsx`) is the only way a screen renders a
  topbar, so the tag cannot be forgotten and cannot be a constant: it is a server component that
  asks the API on every render, with a 3 s timeout rather than the transport's 10 s. There is
  deliberately no cache, because a cached tag describes a connection that may already be gone.
- `/v1/health` answers `{"status": "ok"}` or 503 `db_unreachable`, and nothing else. So the tag
  can say `api-client` and cannot repeat the prototype's "connected, production db". BACKEND_GAPS
  4.5 and 4.6 (the handler's documented nil-DB behaviour is not implemented: it panics).
- `(console)/[...slug]` renders a named "not built yet" state for routes the sidebar links to, and
  a real 404 for anything else. `api/[...slug]` answers a JSON 404 for every method, so an
  unmatched `/api` path is legible to a caller instead of falling through to a page redirect (D13).
- **Verified by hand against real HTTP**, not only in unit tests: with `CRYDEN_MODE=live` and a
  throwaway stub on `CSAX_API_URL` (never committed), the console called `POST /v1/login`, then
  `GET /v1/sessions` to resolve the API session id, then `GET /v1/health`, and sign-out called
  `POST /v1/logout` and answered `{"revoked":true}` with the cookie cleared and `/dashboard`
  redirecting again. All four tags were seen on a running server: `fixtures` from config with no
  call, `offline` with nothing on 8080, `degraded` against a stub answering 503 `db_unreachable`,
  and `api-client` against `{"status":"ok"}`.
- **The landing page (step 0.7).** `/` is `src/app/page.tsx`: static, reads no cookie, calls no
  API, and the only static route in the app. "Open console" points at `/dashboard`, which is where
  the console decides between the dashboard and the sign-in screen. See D14 for the four decisions
  behind it.
- The landing page's console map renders `NAV_GROUPS`, so the marketing list cannot drift from the
  sidebar, and the heading's count comes from the same array. `NavItem.readOnly` (new, optional) is
  set on the four AI screens, which is what draws the `read-only` tag next to them and what the e2e
  spec checks item by item. The sidebar does not use it yet; when the AI screens are built it is
  the flag that keeps the invariant visible in the console too.
- The prototype's landing copy was reconciled with the Go source before it was ported, not after:
  six OAuth providers, "NIST 800-63B", webhook delivery as an unimplemented interface, `Go 1.22+`
  and a `csax ai ask` command that exists nowhere were all wrong. Each correction has an entry in
  BACKEND_GAPS section 2 (2.2, 2.4, 2.11, 2.12) and a note in D14. The claims that survived were
  checked first: lockout at five attempts and fifteen minutes, the seven registered claim names,
  and the 21 screens.
- `docs/guide/screenshots/` is empty until step 0.8, which generates the README's screenshots from
  Playwright.
- Fonts: the prototype's two Google Fonts tags (`preconnect` and the `css2?family=Sora...`
  stylesheet) were **not** ported, because `src/app/layout.tsx` already self-hosts all three
  families through `next/font`. `tests/e2e/landing.spec.ts` fails if any request leaves the origin,
  so a CDN font cannot come back unnoticed.
- Contrast was measured rather than assumed, which is why the landing block uses `--text-muted`
  where the prototype used `--text-dim`: dim is 2.95:1 on `--bg` and fails AA for text, muted is
  5.88:1. Every text colour on the page passes; the console's own screens still use dim in places
  and have not been re-measured.
- **Documentation (step 0.8).** The README carries the thirteen things BUILD_NOTE section 8 asks
  for, and every status statement in it is the state of the code rather than the state of the plan:
  one screen partial, twenty planned, and each planned one named with the step that builds it. Its
  configuration table is generated from the zod schema in `src/server/config/index.ts`, with the
  `SENSITIVE_KEYS` set deciding the secret column, so the table cannot drift from the loader.
- The README's badge row has no CI badge, and the README says why in one line rather than leaving a
  reader to notice. The workflow arrives in step 5.6. See D15.
- Screenshots are generated, not captured by hand: `pnpm screenshots` runs
  `playwright.screenshots.config.ts` against `tests/screenshots/capture.spec.ts` and writes into
  `docs/guide/screenshots/`. A separate config on purpose, so a gate run never leaves a dirty tree.
  The console shots need a session and there is no API here to sign in against, so
  `tests/screenshots/session.ts` mints one in the console's own cookie format from the gitignored
  `.env.local`, and the run skips those two shots with a printed reason when no secret is present.
  The operator they show is `operator@example.test` and the tokens are placeholders, which is why
  the connection tag in them reads `fixtures`.
- **Running the production build found three things the dev server hides** (D16): a bad key reported
  `is not valid` instead of the refine's own message, because `describeIssue` had no `custom` case
  (fixed, with a test); the standalone server needs `public/` and `.next/static/` copied in or every
  asset 307s to `/login`; and `next start` warns that it does not work with `output: standalone` and
  serves anyway. The third is left for step 5.6, which owns packaging.
- One deviation from D13 is recorded rather than fixed: an unauthenticated request to a path that is
  not a navigation route is a 307 to `/login`, not the 404 D13 promises, because the `(console)`
  layout's session check runs before the page. Defensible for a console, and the `robots.txt`
  consequence is worth its own small follow-up.
- **Tag scheme.** Tier 0 uses the `v0.0.x` line, so tier 0 is `v0.0.1` and `package.json` says
  `0.0.1`. Tiers 1 to 5 are `v0.1.0` to `v0.5.0`, and `v1.0.0` closes the project when the README,
  the docs and every gate are complete. This file had it shifted up by one until step 0.9: it read
  tier 0 as `v0.1.0` and ended tier 5 at `v1.0.0`, which is one tag too high at every tier. BUILD_NOTE
  fixes both ends (line 85 for tiers 1 to 5, line 155 for tier 0), so check those two lines rather
  than trusting a tier table.

## Tier summaries

### Tier 0: Foundation. Tag `v0.0.1`. Committed 2026-10-04.

**What shipped.** The console's frame, and the pieces every screen will sit on.

- The Next.js app: App Router, TypeScript strict, pnpm, ESLint, Prettier, Vitest, Playwright, a
  commitlint `commit-msg` hook and `.claude/settings.json`, MIT `LICENSE`, `.env.example` with
  placeholders only.
- The design system, ported from the prototype's `styles.css`: Card, Pill, Toggle, Button,
  DataTable, Modal, Toast, Sidebar, Topbar, EmptyState, ErrorState, Skeleton, plus a dev-only
  gallery at `/design` that 404s in a production build.
- The configuration loader: environment, then `<KEY>_FILE`, then `csax.config.json`, then defaults,
  with every problem reported at once, no value ever printed, and a boot that stops with exit 1
  rather than failing later on whichever screen touches the setting first.
- The console's own store, with migrations for Postgres and SQLite from one schema, applied on boot
  unless `SKIP_AUTO_MIGRATE`.
- Operator sign-in against the API: `POST /v1/login`, the paused-login completions, `/v1/refresh`,
  roles, CSRF on every mutation, and an encrypted `httpOnly` cookie carrying the API's tokens where
  a page script cannot read them.
- The API client: one interface, a live adapter and a labelled fixtures adapter chosen by
  `CRYDEN_MODE` alone, and a topbar tag that reads `api-client`, `degraded`, `fixtures` or `offline`
  from a real answer.
- The landing page at `/`, static, with its console map generated from the console's own navigation.
- The documentation set: README, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT, CHANGELOG, the guide under
  `docs/guide/`, this file, DECISIONS and BACKEND_GAPS, and six screenshots generated by Playwright.

Verified by running it, not only in tests: 119 unit tests, 21 e2e tests, a clean production build
with `/` prerendered static, and a real `node .next/standalone/server.js` probed over HTTP for
`/` (200, prerendered), `/design` (404 in production), `/dashboard` (307 to `/login`) and
`/api/nonsense` (JSON 404). A boot with a missing key was confirmed to exit 1 with a readable list.

**What is fixture-only.** One thing, and it is labelled on screen: the `fixtures` connection state.
The fixtures adapter implements `health()` and nothing else, so `CRYDEN_MODE=fixtures` boots the
console, renders the landing page and the design system, and shows the `fixtures` tag. It cannot
sign anyone in, and it is never a fallback for a live call that failed. The six guide screenshots of
the console use a session minted locally in the console's own cookie format, with
`operator@example.test` and placeholder API tokens, which is why the tag in them reads `fixtures`.

**What is blocked on the backend.** Five things found while building sign-in, all in
`docs/build/BACKEND_GAPS.md` section 4:

- 4.1 `POST /v1/login` does not return the session id it just created, so the console guesses by
  taking the newest from `GET /v1/sessions`. Signing out degrades rather than lies when the guess
  cannot be made: it reports `revoked: false`.
- 4.2 Nothing says which operators may manage other operators, so the console's `owner` role is
  unreachable until `GET /v1/admin/operators` exists (D10).
- 4.3 The second-factor endpoints are absent from the API's OpenAPI document, so their shapes were
  read from the handlers and are checked with zod on the way in.
- 4.4 WebAuthn is never a primary login: a passkey can only finish a login a password already
  started, so the sign-in screen asks for the password first.
- 4.5 `GET /v1/health` reports a status and nothing else, so the tag says `api-client` and cannot
  repeat the prototype's "connected, production db".
- 4.6 The health handler's documented nil-database behaviour is not implemented; it panics.

Everything else the later tiers need is in section 1's table, grouped by the tier that first wants
it. None of it blocks tier 1 from starting, and each screen whose endpoint is missing renders a
specific state rather than an empty table.

**Next step.** 1.1: the Dashboard, with real counts from `GET /v1/admin/users`, recent activity, and
a digest card or an honest empty state. It replaces the session card that stands there now.
