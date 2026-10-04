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

## Tier 0 - Foundation (tag v0.1.0)

- [x] 0.1 Init: pnpm workspace, Next.js 15 + TS strict, ESLint, Prettier, Vitest, Playwright,
      commitlint + `commit-msg` hook, `.claude/settings.json`, LICENSE (MIT), `.env.example`
- [x] 0.2 Design system: port `styles.css` tokens; Card, Pill, Toggle, Button, DataTable, Modal,
      Toast, Sidebar, Topbar, EmptyState, ErrorState, Skeleton
- [x] 0.3 Config loader (env, `*_FILE`, disk file, defaults) + boot-time fail-fast + `describeConfig()`
- [x] 0.4 Console store + migrations (Postgres/SQLite, same schema, two drivers), auto-migrate
      unless `SKIP_AUTO_MIGRATE`
- [x] 0.5 Operator auth: API-backed login (`/v1/login` + paused-login completions, `/v1/refresh`),
      roles owner/admin/viewer, CSRF, encrypted session cookie
- [ ] 0.6 Cryden client interface + fixtures adapter + live adapter + health check;
      topbar tag reflects real state (`api-client` / `degraded` / `fixtures` / `offline`)
- [ ] 0.7 Landing page ported from `landing.html` to a real route; accessibility fixed
- [ ] 0.8 README.md, SECURITY.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, CHANGELOG.md,
      `docs/build/DECISIONS.md`, `docs/build/BACKEND_GAPS.md`
- [ ] 0.9 Tag v0.1.0 and write the tier summary below

## Tier 1 - Identity (tag v0.2.0)

- [ ] 1.1 Dashboard: real counts, recent activity, digest card or empty state
- [ ] 1.2 Users: server-side search, pagination, detail drawer, actions with confirm + audit
- [ ] 1.3 OAuth Providers: real configured list, reachability checks (5 s timeout, cached)
- [ ] 1.4 MFA & Passkeys: real adoption stats; force-disable requires re-verification
- [ ] 1.5 Email & Magic Link: real delivery stats, SSR + sanitised template preview, send test
- [ ] 1.6 Password Policy: read/write real policy, stable violation codes, hash-migration bar
- [ ] 1.7 Tag v0.2.0 and write the tier summary below

## Tier 2 - Security (tag v0.3.0)

- [ ] 2.1 Sessions: real list, named devices, revoke one / revoke all, sidebar badge from real count
- [ ] 2.2 Anomalies: six signal codes + credential stuffing, "Mark reviewed" persists a note
- [ ] 2.3 Audit Log: filters (event, user, range), cursor pagination, CSV export (admin+)
- [ ] 2.4 Tag v0.3.0 and write the tier summary below

## Tier 3 - Developer (tag v0.4.0)

- [ ] 3.1 API Keys: create (shown once, hash stored), list with prefix + last used, revoke
- [ ] 3.2 Webhooks: CRUD, signing secret shown once, test delivery, delivery log
- [ ] 3.3 JWT Claims: editor refusing the seven registered claims, real preview token
- [ ] 3.4 Cloud Logging: provider toggles, vault-held credentials, real shipped events
- [ ] 3.5 Tag v0.4.0 and write the tier summary below

## Tier 4 - AI admin, read-only (tag v0.5.0)

- [ ] 4.1 `src/server/ai/`: allowlisted read-only query templates on `READONLY_DATABASE_URL` + test
- [ ] 4.2 AI Assistant modes (query, logs, anomalies scan, audit, ask) with citation chips
- [ ] 4.3 Weekly Digest: schedule, recipients, delivery, history
- [ ] 4.4 Support Assistant: scoped lookup, escalation, ticketing interface
- [ ] 4.5 Config Advisor: 30-day evidence, suggestions pre-fill a field, human saves
- [ ] 4.6 Ask-AI Widget: embeddable script, verified token, unconditional identity substitution,
      adversarial test suite
- [ ] 4.7 LLM Provider + Database Provider: real abstraction, usage counters, connection test
- [ ] 4.8 Tag v0.5.0 and write the tier summary below

## Tier 5 - Settings, Secrets, Deployment (tag v1.0.0)

- [ ] 5.1 Operators: invite, role change, remove, passkey management, operator sessions
- [ ] 5.2 Secrets: providers (env/file/vault), AES-256-GCM vault, masked list, step-up reveal,
      key rotation, audit
- [ ] 5.3 Config view (source of each setting, redacted)
- [ ] 5.4 SQLite mode: honest 501 state instead of broken screens
- [ ] 5.5 Hardening: CSP, security headers, rate limiting, lockout, /healthz, /readyz, JSON logs
- [ ] 5.6 Packaging: Dockerfile, docker-compose, Kubernetes manifest, GitHub Actions CI
- [ ] 5.7 Tag v1.0.0 and write the tier summary below

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

## Tier summaries

(one block per finished tier: what shipped, what is fixture-only, what is blocked on the backend,
the tag created, and the exact next step)
