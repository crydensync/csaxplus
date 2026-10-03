# csax+ build progress

This file is how a new chat resumes the work. Read it first, continue from the first unchecked
item, and keep it current: tick a step after each commit, and rewrite the tier summary at the end
of every tier.

Stack: Next.js 15 (App Router) + TypeScript strict, pnpm, Tailwind v4 + the `styles.css` tokens,
zod, `@simplewebauthn/*`, jose, postgres/drizzle + better-sqlite3, vitest, playwright.

Architecture (brief section 11): `browser -> Next.js BFF -> api (/v1/*, /v1/admin/*) -> engine -> Postgres|SQLite`.
The console never holds the engine's primary credentials. Only `READONLY_DATABASE_URL` is an exception.

---

## Tier 0 - Foundation (tag v0.1.0)

- [x] 0.1 Init: pnpm workspace, Next.js 15 + TS strict, ESLint, Prettier, Vitest, Playwright,
      commitlint + `commit-msg` hook, `.claude/settings.json`, LICENSE (MIT), `.env.example`
- [x] 0.2 Design system: port `styles.css` tokens; Card, Pill, Toggle, Button, DataTable, Modal,
      Toast, Sidebar, Topbar, EmptyState, ErrorState, Skeleton
- [ ] 0.3 Config loader (env, `*_FILE`, disk file, defaults) + boot-time fail-fast + `describeConfig()`
- [ ] 0.4 Console store + migrations (Postgres/SQLite, same schema, two drivers), auto-migrate
      unless `SKIP_AUTO_MIGRATE`
- [ ] 0.5 Operator auth: API-backed login (`/v1/login` + paused-login completions, `/v1/refresh`),
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

## Tier summaries

(one block per finished tier: what shipped, what is fixture-only, what is blocked on the backend,
the tag created, and the exact next step)
