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

## Tier 0 - Foundation (tag v0.0.1, then v0.0.2 for step 0.10)

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
- [x] 0.10 Run the Postgres store against a real Postgres (PGlite + `pglite-socket`, a development
      dependency), which found and fixed two defects in a path that had never executed. Tag v0.0.2
      and write the follow-up summary below

## Tier 1 - Identity (tag v0.1.0)

- [x] 1.1 Dashboard: real counts, newest accounts, digest card or empty state. Counts come from
      `GET /v1/admin/users`, `/security/mfa-adoption` and `/security/hash-migration`; the digest
      from `/digest/history`. The prototype's "Recent activity" and "Active sessions" have no
      endpoint (BACKEND_GAPS 2.13) and were replaced rather than faked
- [ ] 1.2 Users: server-side search, pagination, detail drawer, actions with confirm + audit.
      Split into three commits: **(a) the read-only screen (done)**, (b) WebAuthn step-up, then
      (c) the six Go endpoints and the actions that need them
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
- **Postgres runs (step 0.10).** `tests/unit/db-postgres.test.ts` boots PGlite (Postgres compiled to
  WebAssembly) behind `@electric-sql/pglite-socket`, which serves the real wire protocol over TCP, and
  then calls the **shipped** `openPostgresStore(url)`: postgres-js, the `?` to `$1` rewrite,
  `client.begin`, the DDL, the drizzle handle. Both are development dependencies. A parallel
  in-process driver was rejected for exactly this reason: it would have agreed with the tests and
  could still have disagreed with a deployment, which is what happened twice over (D17). Statements
  about the Postgres store are no longer structural-only. The socket
  server multiplexes connections onto one PGlite backend, so its `maxConnections` has to be at least
  the `max: 5` pool; the suite resets the `public` schema between tests rather than paying for a new
  WebAssembly instance.
- Postgres sends a `NOTICE` for `create table if not exists console_migrations` on every boot against
  an already-migrated store, and postgres-js prints notices as a raw object to stdout. Noisy, and
  left alone deliberately: choosing what an operator should see is the logging policy that arrives
  with `LOG_LEVEL` and JSON logs in step 5.5, not something to invent here.
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
- **Tag scheme.** Tier 0 uses the `v0.0.x` line, so tier 0 is `v0.0.1` and `package.json` said
  `0.0.1`; step 0.10 moved it to `0.0.2`. Tiers 1 to 5 are `v0.1.0` to `v0.5.0`, and `v1.0.0` closes
  the project when the README,
  the docs and every gate are complete. This file had it shifted up by one until step 0.9: it read
  tier 0 as `v0.1.0` and ended tier 5 at `v1.0.0`, which is one tag too high at every tier. BUILD_NOTE
  fixes both ends (line 85 for tiers 1 to 5, line 155 for tier 0), so check those two lines rather
  than trusting a tier table.
- **The dashboard (step 1.1).** `src/app/(console)/dashboard/page.tsx` is now a thin server
  component (session check, redirect, topbar) that hands the screen to a client component. The data
  comes from `GET /api/console/dashboard`, a console route rather than a call from the server
  component, because the API access token needs renewing and only a route handler can write the
  cookie that renewal sets. Full reasoning in D18.
- `src/server/cryden/admin.ts` holds the four admin reads and is deliberately **not** on the
  two-adapter `CrydenClient`: every function there takes an operator token, and a token only exists
  after a real sign-in, so a fixtures implementation would be a fake path to a screen nobody can
  reach. Each answer is checked with zod before it is used, and a field renamed on the API's side
  arrives as a named failure rather than as `undefined` on a card.
- `src/server/dashboard/overview.ts` gathers the four reports and returns a `Section<T>` for each.
  `unavailable` (`not_implemented_on_sqlite`), `forbidden` (`not_operator`) and `empty`
  (`not_configured`) are separate from `error` because none of the first three is a fault, and each
  sends an operator somewhere different. When all four sections share one state, the screen shows one
  message instead of six identical cards (four tiles, the digest, the table): all unavailable, all
  forbidden, or all failing with the same sentence. The first two are answers the API gave correctly
  and are drawn as states; the third is a fault and is announced as one, with a retry. A shared
  `error` collapses only when all four sentences are identical, since four different failures are
  four different things to fix.
- The API's `not_configured` code is shared by every feature whose store was never wired, so the
  sentence for it is supplied per section: an unconfigured digest says to set
  `DIGEST_INTERVAL_HOURS`, and an unconfigured anything else says the report has no store. The
  wording lives in `src/lib/dashboard.ts`, imported by both the server and the browser, so a
  failure cannot be worded two ways.
- `formatInstant` formats on UTC and names the zone. These timestamps are read beside API counts and
  against logs, both of which are UTC, and one clock is also what keeps a server render and a
  browser render identical.
- The digest is rendered as `<pre>` text inside `.digest-text`, never as markup, and never rewritten:
  it is the engine's own report, stored verbatim by the API. It is also the only place an em dash can
  reach the screen, since the engine's header line contains one (BACKEND_GAPS 2.14).
- **The four dashboard states cannot be reached in a browser yet**: every one needs a signed-in
  operator, and a session needs a real sign-in against a real API. They are covered by
  `tests/unit/dashboard-view.test.tsx`, which renders the component for real in jsdom against a
  stubbed console route and asserts on the text an operator would read (19 cases). Both collapse
  tests were checked by mutation: disabling the shared-`error` branch reproduces the six-panel
  screen exactly. The end-to-end suite still covers the signed-out redirect and the 401 from the
  console route.
- Sign-out sits in the dashboard's topbar, where it was in tier 0, because the dashboard is still
  the only screen with real content. When the sidebar's other entries become screens it belongs in
  the shell so every one of them has it. Recorded here rather than in the screen.
- The narrow-viewport check was measured, not eyeballed: at 375 px and 320 px the dashboard's
  `scrollWidth` equals `innerWidth` with nothing outside the intended scrollers, the digest head
  wraps its timestamp onto a second line rather than overflowing, and a long report is capped at
  `20.8em` with its own scrollbar. The cap is in `em` rather than pixels so it lands on a line
  boundary (13 lines at a 1.6 line height); a round pixel value cut the last visible line in half.
  The accounts table scrolls inside `.table-scroll`, as the prototype's did.
- **The guide's dashboard image is a real deployment, not a mock.** The capture harness takes
  `CSAX_SCREENSHOT_EMAIL`/`CSAX_SCREENSHOT_PASSWORD` from the environment or the gitignored
  `.env.local` and signs in for real, so the committed shot shows the `api-client` tag, live counts
  and a real `not_configured` digest. Without those variables it falls back to the minted cookie,
  whose API tokens are placeholders: that still photographs a signed-in shell, with every
  API-backed report showing the state an unreachable API produces. Two things came out of capturing
  it: the shot has to wait for the screen to leave its loading state, because the reads happen after
  hydration and the first attempt photographed the skeletons; and `pnpm screenshots` now pins
  `CRYDEN_MODE=live`, because the checkout's default of `fixtures` tagged the health check as
  fixtures while the reports, which have no fixtures implementation, still said the API was
  unreachable.

- **The Users screen (step 1.2a).** Read-only, and deliberately so: the actions the step calls for
  need six endpoints the API does not have (BACKEND_GAPS section 1, tier 1), so this commit is the
  list, the search, the pager and the detail drawer, and the actions follow once the Go side exists.
  `src/app/(console)/users/page.tsx` is the same thin server component the dashboard's is:
  session check, redirect, topbar, hand off to a client component.
- `src/app/api/console/users/route.ts` and `.../users/[userID]/route.ts` are console routes for the
  reason D18 gives: the API access token is renewed on the screen's own call, and only a route
  handler can write the cookie that renewal sets. The detail route reads `GET /v1/admin/users/{id}`
  and `GET /v1/admin/users/{id}/metadata` together and answers one envelope with a `Section` for
  each, so a deployment whose metadata store is not wired still shows the account.
- **The table shows the fields the API sends.** Account, Created, Last change, Failed attempts and
  Status. The prototype's Provider, MFA and Last seen have no endpoint behind them, and an empty
  cell would read as an account with no provider rather than as a console that cannot know. Full
  reasoning in D19 and BACKEND_GAPS section 5.
- **Search is one exact address, and the screen says so.** The API's `email` parameter is an exact,
  case-sensitive match, so the pager prints the API's own `match` field as a sentence and a miss is
  worded as a search that found nothing, never as an account the API has lost. A console-side
  substring filter was rejected: it would filter one page of twenty-five while the count below it
  described the whole table.
- The pager derives everything from the answer: `offset`, `limit`, `total` and how many rows came
  back. Previous is disabled at offset 0 and Next when `offset + shown` reaches `total`, so a last
  page that is short does not produce an empty one.
- `src/components/Drawer.tsx` is new, sharing the modal's keyboard contract through the existing
  `useFocusTrap`: focus moves in on open, Escape closes, focus returns to the row that opened it,
  and body overflow is restored. Its first focusable element is the close control rather than an
  action, so the panel cannot be triggered by pressing Enter twice.
- **Overlays now render into the document body** through `src/components/overlay-portal.tsx`, and
  both `Drawer` and `Modal` use it. Found by probing the drawer in a real browser: it measured
  1180x423.25 against a 1440x1000 window because `.view.anim` fills a `translateY` keyframe, which
  makes every screen a containing block for `position: fixed`. D20 has the reasoning and the two
  things that are load-bearing about the fix.
- `src/components/section-state.tsx` is the "answered, but not with data" panel the dashboard had
  grown, lifted out and reused: `unavailable`, `forbidden` and `empty` render through it, and only
  `error` is announced as a fault with a retry. `src/components/sign-out-button.tsx` moved up out of
  the dashboard's directory, since both screens now carry it.
- The Users states cannot be reached in a browser without a signed-in operator, so they are covered
  by `tests/unit/users-view.test.tsx` (21 cases: loading, real fields, the pager and match sentence,
  a lockout's expiry, the empty deployment, search and its miss, clearing the search, both paging
  directions, the SQLite state, a failed route, an unreadable answer, and the drawer's read, its
  metadata, focus in and focus back). `tests/unit/users-browse.test.ts` (13 cases) covers the mapping
  from API codes to sections, and `tests/unit/cryden-admin.test.ts` grew the two new reads. The
  end-to-end suite gained `/users` in the signed-out redirect loop, which is what the console group's
  layout guard is for.
- **The guide's Users image is taken through the screen's own search.** Re-capturing the console
  shots against the live API photographed two real accounts that had been created on that
  deployment since the last capture, and the list is every account the deployment holds. The capture
  now narrows the Users shot to the address the run signed in as, so the image is a real search over
  a real row and no one else's address goes into the repository. The dashboard's newest-accounts
  table cannot be narrowed that way, so its committed image stays the one taken from a deployment
  holding sample data only, and that is written down in the guide's setup page rather than left as a
  trap for the next person who runs the capture.
- Verified against the live API with a real operator session, not only in tests: the list, an exact
  search that hits, one that misses, a detail read, a traversal-shaped id (400 `invalid_request`), a
  missing id (`not_found`, both sections empty), the reserved claim names and an empty metadata
  object. The screen was opened in a browser at 1440 px, and measured at 375 px inside an iframe:
  `scrollWidth` equals `clientWidth`, with the table inside `.table-scroll` as the prototype had it.
- **`pnpm format:check` is not in the gate, and drifted long enough to matter.** The gate is lint,
  typecheck and test, so `format:check` was never run and had been failing on 21 files since tier 0:
  `src/lib/api-status.ts` was already unformatted at its birth commit. It is clean now, in its own
  commit, but the step 5.6 CI would otherwise have opened on a red run that had nothing to do with
  the code it was checking. Worth deciding whether the gate should call it, since a formatter nobody
  runs is a formatter that lies about the tree.
- **One e2e test raced its own timeout, and the shape is worth recognising.** The landing page's
  sign-in redirect test cold-compiles the whole console group: about 15 s idle, 24 s with the rest of
  the suite compiling alongside it. Its assertion allowed 60 s, but no test-level override was set,
  so the 30 s default stopped the test first and the 60 s could never be reached. It failed twice
  while 21 files were being reformatted at once, and passed before and after. The test is marked slow
  now (90 s). Every other test that raises an assertion timeout above its test timeout has the same
  bug, so check both numbers, not just the one in the assertion.

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
The one claim this summary could not make at the time was that the Postgres store had ever been
executed; step 0.10 closed that, and found two defects while doing it.

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

### Tier 0 follow-up (step 0.10). Tag `v0.0.2`. Committed 2026-10-04.

**What shipped.** The Postgres half of the console store now runs, and two defects it was hiding are
fixed. Nothing on screen changed.

- `tests/unit/db-postgres.test.ts`: eight tests that boot PGlite behind `@electric-sql/pglite-socket`
  and drive the shipped `openPostgresStore` over TCP, covering the migration runner, the DDL as the
  system catalogs report it against the typed schema, and a round trip through the drizzle handle
  including a unique violation and a `timestamptz` read back as an instant. The suite is 127 tests.
- Two fixes in `src/server/db/drivers.ts`, both in code that had never executed. Full account in D17.

Verified by running it: the suite above, plus the **built** standalone server booted with
`CSAX_STORE_URL` pointing at that same PGlite, which logged `csax+ store ready on postgres, applied
0001` and then served `/` 200 and `/dashboard` 307 to `/login`. A second boot against the same
database logged no migration line, which is what "nothing outstanding" looks like.

**What is fixture-only.** Unchanged: the `fixtures` connection state, labelled on screen.

**What is blocked on the backend.** Unchanged. The same five entries in `BACKEND_GAPS.md` section 4.

**Next step.** 1.2: Users. Server-side search and pagination over `GET /v1/admin/users` (which
already takes `limit`, `offset` and `email`), a detail drawer from `GET /v1/admin/users/{userID}`,
and the account actions, every one of which needs an endpoint the API does not have yet
(BACKEND_GAPS section 1, tier 1: unlock, suspend, unsuspend, mfa/disable, oauth unlink). Those
actions are the first thing in this project that writes through the API, so they need the audit
trail the API does not expose either.
