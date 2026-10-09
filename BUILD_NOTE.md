# csax+ — Build Brief for Claude Code

> Audience: Claude Code running the `deepseek-v4-flash` model.
> Goal: turn the static prototype (`index.html`, `landing.html`, `styles.css`, `app.js`) into the **real, working csax+ console** for CrydenSync, in five tiers, with a detailed open-source README.
> Read this whole file before writing any code. Work in small steps. After each step, run the verification gate before committing.

---

## 0. Ground rules (non-negotiable)

1. **The prototype is a design spec, not the implementation.** Keep the look (dark theme, violet accent, tokens in `styles.css`, Sora/Inter/JetBrains Mono, the same layout and copy tone). Replace every canned/fake behaviour with real behaviour.
2. **API-first, and never fake a backend.** The engine is `github.com/crydensync/cryden` (Go library) and the HTTP layer is `github.com/crydensync/api` (`/v1/admin/*`). The console talks to the API only (see section 11, which overrides anything above or below that conflicts with it). Before building each screen, clone both repos into `../_reference/` and read them. If an endpoint a screen needs does not exist:
   - add it to the `api` repo (and the engine if required) as its own commits, following the existing handler, auth and test patterns (section 11),
   - record it in `docs/build/BACKEND_GAPS.md` while it is missing,
   - use the labelled fixture adapter only when `CRYDEN_MODE=fixtures`, never as a silent substitute for a real call.
3. **No hardcoded secrets, emails, or sample data in real code.** The prototype contains fake keys and users (priya@, daniel@, `sk-ant-…`, `postgresql://…`). Those exist only in the fixtures adapter and tests. Never copy them into config, README examples (use `<placeholders>`), or commits.
4. **Read-only AI invariant.** No AI feature may hold a reference to any write path. No tool, no method, no "allow write" toggle that works. The toggle in the LLM Provider screen stays locked off. The Ask-AI widget must discard any model-produced identity filter and substitute the verified user id from the caller's token, unconditionally (see landing page, AI section).
5. **Zero telemetry.** The console never phones home. No analytics SDKs, no external fonts at runtime in production builds (self-host Sora/Inter/JetBrains Mono via `next/font` or `@fontsource`).
6. **Security defaults:** no `innerHTML` with user data (the prototype's `app.js` uses it; do not port that), strict CSP, `httpOnly` + `Secure` + `SameSite=Lax` cookies, CSRF protection on all mutations, input validation with `zod` on every route handler, constant-time comparisons, never log secret values.
7. **No em dashes or en dashes anywhere.** Never write `—` or `–` in code, comments, UI copy, docs, README, tests, config, or commit messages. Use a comma, period, colon, parentheses, or a plain hyphen `-` instead. The prototype copy contains many em dashes (for example "Prototype — not wired up"); rewrite them when porting. Before every commit run `git diff --cached | grep -nE "[—–]"` and expect no output.

---

## 1. Stack decision

Use **Next.js (App Router) + TypeScript (strict)**. Reason: the console needs a server side to (a) hold secrets and credentials that must never reach the browser, (b) verify WebAuthn, (c) proxy to the Go API, (d) read config from env/disk at runtime.

| Concern | Choice |
|---|---|
| Framework | Next.js 15, App Router, `output: "standalone"` |
| Language | TypeScript, `strict: true` |
| Styling | Port `styles.css` tokens into CSS variables + Tailwind v4 (or CSS Modules). Keep token names (`--violet`, `--surface`, …) |
| Validation | `zod` |
| WebAuthn | `@simplewebauthn/server` + `@simplewebauthn/browser` |
| Operator session | Signed, encrypted cookie via `jose` (no third-party auth service) |
| Operator store | The console's own small store. Postgres via `postgres`/`drizzle-orm` when `DATABASE_URL` is set, else SQLite file via `better-sqlite3` for local/dev. Same schema, two drivers |
| Tests | `vitest` (unit), `playwright` (e2e, with a virtual WebAuthn authenticator) |
| Lint/format | `eslint`, `prettier`, `tsc --noEmit` |
| Package manager | `pnpm` |
| Container | Multi-stage `Dockerfile` + `docker-compose.yml` (console + Postgres + the CrydenSync API) |

If you believe another choice is better, write the reason in `docs/build/DECISIONS.md` first, then proceed. Do not switch silently.

Suggested layout:

```
src/
  app/                    # routes, one folder per screen
    (marketing)/page.tsx  # landing page
    (console)/…           # authenticated screens
    api/…                 # route handlers (BFF)
  components/             # Card, Pill, Toggle, DataTable, Toast, Modal, …
  server/
    config/               # env + file config loader (see §3)
    secrets/              # secret providers + vault (see §4)
    cryden/               # typed client for /v1/admin + fixtures adapter
    ai/                   # read-only AI layer
    db/                   # console store, migrations
  lib/                    # shared utils
docs/
  guide/                  # user-facing docs
  build/                  # PROGRESS.md, DECISIONS.md, BACKEND_GAPS.md
tests/
public/                   # logo ("cryden icon.png" → cryden-icon.png), og-image.png
```

Rename `cryden icon.png` to `cryden-icon.png` (no space) and update references.

---

## 2. Commit and git rules

- Use **Conventional Commits**: `feat(users): …`, `fix(secrets): …`, `docs(readme): …`, `chore(deps): …`, `test(webauthn): …`, `refactor(config): …`, `ci: …`.
- **One commit per releasable step** — a step that builds, passes its gate, and could be tagged on its own. No giant "everything" commits, no "wip" commits on the main line.
- Subject ≤ 72 chars, imperative mood, lowercase after the type. Add a body when the *why* is not obvious.
- **Do NOT add any `Co-authored-by:` trailer, and do not add "Generated with Claude Code" or any Anthropic/Claude attribution** to commit messages, PR text, README, or code comments. Make this hold in three ways:
  1. First action of the project: create `.claude/settings.json` containing
     ```json
     { "includeCoAuthoredBy": false, "attribution": { "commit": "", "pr": "" } }
     ```
     (one of the two keys depends on the Claude Code version; keep both).
  2. Add a `commit-msg` git hook (via `husky` or a plain `.githooks/commit-msg` with `git config core.hooksPath .githooks`) that **rejects** any message matching `Co-authored-by` or `Generated with`, and also enforces Conventional Commits (`commitlint` with `@commitlint/config-conventional`).
  3. Before finishing each tier run: `git log --format=%B | grep -iE "co-authored|generated with" || echo clean` and expect `clean`. If not, fix with an interactive rebase.
- Tag at the end of each tier: `v0.1.0` (tier 1) … `v0.5.0` (tier 5), `v1.0.0` when the README, docs and all gates are complete.
- Never commit `.env*` (except `.env.example`), key files, SQLite files, or anything under `secrets/`.

---

## 3. Configuration: env first, disk as fallback

Build `src/server/config/` as a single typed loader used by the whole app. Resolution order for every setting `FOO`:

1. `process.env.FOO` (production / containers / PaaS)
2. `process.env.FOO_FILE` → read the file at that path, trim trailing newline (Docker/Kubernetes secrets convention)
3. A config file on disk: path from `CSAX_CONFIG_FILE`, default `./csax.config.json` (or `.toml`), for local use. Parse and validate with `zod`.
4. Documented default (only for non-sensitive settings)

Rules:
- Validate everything **at boot** and fail fast with a readable error listing every missing/invalid key at once (never a stack trace, never the value).
- Expose a redacted `describeConfig()` for the Settings screen (shows *which source* each value came from: `env`, `file`, `default` — never the value).
- Server-only: `import "server-only"` in the loader so it cannot be bundled into client code.
- Ship `.env.example` with every key, a comment, and a safe placeholder. Ship `csax.config.example.json`.

Minimum keys (extend after reading the API repo): `CRYDEN_API_URL`, `CRYDEN_API_TOKEN`, `CRYDEN_MODE` (`live` | `fixtures`), `DATABASE_URL`, `READONLY_DATABASE_URL`, `CSAX_SESSION_SECRET`, `CSAX_VAULT_KEY`, `WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME`, `WEBAUTHN_ORIGIN`, `RESEND_API_KEY` (or the email provider chosen), `LLM_PROVIDER`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `LOG_LEVEL`, `SKIP_AUTO_MIGRATE`.

The Go engine selects Postgres or SQLite with exactly one env var and treats setting both as a startup error. Mirror that behaviour in the console's own store selection.

---

## 4. Secrets: real storage, real masking

The **Settings & Secrets** screen manages deployment credentials. Implement a `SecretProvider` interface with these providers, selectable and combinable:

- `EnvProvider` — read-only view of values coming from `process.env` (shown as "managed by environment", edit/delete disabled, with an explanation).
- `FileProvider` — read-only view of `*_FILE` / `/run/secrets/*` values.
- `VaultProvider` — values created in the UI, stored in the console store **encrypted at rest** with AES-256-GCM (Node `crypto`), key from `CSAX_VAULT_KEY` (32 bytes, base64). Random 12-byte nonce per value, authenticated with the secret's name as AAD. Support key rotation (`key_id` column + re-encrypt command).

Behaviour:
- The list endpoint returns **names, tags, source, last-updated, and a masked placeholder only**. Plaintext never travels to the browser except through the reveal flow below.
- Reveal returns plaintext for a single secret over a no-store response, only when a valid step-up grant exists (§5). The client re-masks after 20 s (keep the countdown UI) **and** the server-side grant expires at the same time — the timer is not just cosmetic.
- Add / edit / delete are `VaultProvider` operations only and each requires a fresh step-up grant.
- Every reveal/add/edit/delete/copy writes an audit event (who, which secret *name*, action, result). Never write values.
- Replace the prototype's `prompt()` dialogs with a proper modal form.

---

## 5. Fingerprint / Face ID: real WebAuthn

The prototype's biometric modal is theatre. Make it real.

**Operator enrollment**
- First run: if no operators exist, show a one-time bootstrap screen, gated by a `CSAX_BOOTSTRAP_TOKEN` env value, that creates the Owner and registers their first passkey. Provide the equivalent CLI: `pnpm csax:grant-operator --email you@example.com`.
- Operators can register multiple passkeys (laptop Touch ID, phone, security key) and remove them (never the last one).
- Roles: `owner`, `admin`, `viewer`. Enforce on the server for every route, not only in the UI. Viewers cannot reach secrets, mutate anything, or see unmasked data.

**Login** — passkey (discoverable credential) primary. Store credential id, public key, counter, transports, device name, created/last-used. Reject counter regression.

**Step-up unlock for secrets** (this is the "unlock with fingerprint/Face ID" feature)
- `POST /api/secrets/unlock/options` → challenge with `userVerification: "required"`, bound to the operator session, single-use, 60 s TTL.
- Browser calls `startAuthentication` (the real OS prompt: Touch ID / Face ID / Windows Hello / Android biometrics).
- `POST /api/secrets/unlock/verify` → verify against the passkeys on the operator's account at the API, check origin + RP ID + UV flag + counter, then issue a **short-lived, server-held grant** (20 s, tied to session id and the operator). Store grants server-side; do not trust the client about expiry.
- Mutations (edit/delete/add) require a grant that was minted for that action, and consume it.
- Keep the existing modal UI (pulsing rings, "Verify it's you", success state), but drive it from the real promise: show success only on verified server response, show a clear error on failure or cancel. No `setTimeout` fake success.
- Fallback when the device has no platform authenticator: allow a roaming security key; if none works, deny. Do **not** add a password fallback for secrets.

Dev note: WebAuthn requires HTTPS or `localhost`. The relying party (`WEBAUTHN_RP_ID`, bare domain) and the origins it accepts (`WEBAUTHN_RP_ORIGINS`, full origins) belong to the **API**, not to this console: a passkey is a credential on the operator's account there. The console keeps only `WEBAUTHN_ORIGIN`, its own full origin, for the mutation check. See §11.2. Add a Playwright test using Chromium's virtual authenticator.

---

## 6. The tiers

Each tier ends with: all gates green → README/docs section updated → tag → summary of what shipped and what is mocked.

### Tier 0 — Foundation (commit as `v0.0.x`)
1. Init repo, `pnpm`, Next.js + TS strict, ESLint, Prettier, Vitest, Playwright, commitlint + hook, `.claude/settings.json`, `.gitignore`, `LICENSE` (MIT), `.env.example`.
2. Design system: port tokens from `styles.css`; build components `Card`, `Pill`, `Toggle`, `Button`, `DataTable` (with the horizontal-scroll hint), `Modal`, `Toast`, `Sidebar`, `Topbar`, `EmptyState`, `ErrorState`, `Skeleton`. Match prototype visuals.
3. Config loader (§3) with tests.
4. Console store + migrations (Postgres/SQLite), applied on boot unless `SKIP_AUTO_MIGRATE`.
5. Operator auth: bootstrap, passkey login, roles, CSRF, session cookie (§5, without the secrets step-up yet).
6. Cryden client interface + fixtures adapter + `live` adapter skeleton + health check; "connected · production db" tag in the topbar must reflect the real connection state (`connected`, `degraded`, `fixtures`, `offline`).
7. Landing page ported from `landing.html` to a real route; fix accessibility (landmarks, alt text, focus order).

### Tier 1 — Identity
Dashboard, Users, OAuth Providers, MFA & Passkeys, Email & Magic Link, Password Policy.
- Dashboard: real counts and recent activity from the API; digest card shows the latest stored digest or an empty state.
- Users: server-side search, pagination, user detail drawer; actions (create, suspend, force-disable MFA, revoke sessions) with confirmation and audit.
- OAuth: list providers actually configured, real reachability checks (server-side, timeout 5 s, results cached with timestamps). Reconcile the provider list with the engine — the landing page says six (Google, GitHub, Microsoft, Discord, GitLab, Apple) while the prototype console shows five; read the engine and make both match reality.
- MFA: real adoption stats; force-disable requires re-verification.
- Email: real delivery stats from the provider; template editor with **server-side rendering and HTML sanitisation** of the preview (no raw `innerHTML`), variable validation (`{{user_email}}`, `{{action_url}}`, `{{app_name}}`, `{{expires_in}}`), real "Send test".
- Password Policy: read and write the real policy; show **every** violated rule as stable codes in the preview tester; bcrypt→Argon2id migration bar from real hash-algorithm counts. The prototype's "Rehash on next login" toggle describes a behaviour that contradicts its own text; check the engine and either implement what it truly supports or remove the toggle and note it in `BACKEND_GAPS.md`.

### Tier 2 — Security
Sessions, Anomalies, Audit Log.
- Sessions: real list with named devices, revoke one / revoke all for a user; update the sidebar badge from real count.
- Anomalies: the six signal codes (`new_ip`, `new_device`, per-user and per-IP failure velocity, `token_reuse`, `concurrent_sessions`) plus credential-stuffing status; "Mark reviewed" persists a review note (one of the few permitted writes).
- Audit Log: server-side filtering by event type, user and time range, cursor pagination, CSV export (admin+). Zero-width-space email obfuscation in the prototype is a visual hack — drop it.
- Report-only: nothing in this tier may block or challenge a login.

### Tier 3 — Developer
API Keys, Webhooks, JWT Claims, Cloud Logging.
- API Keys: create (show the full `ck_…` key **once**, store only the hash), list with prefix + last used, revoke. The prototype uses `csk_live_` while the landing page says `ck_`; read the engine and use the real prefix.
- Webhooks: CRUD, signing secret shown once, test delivery, delivery log with status codes, retry/backoff visibility.
- JWT Claims: editor that refuses the seven registered claim names all-or-nothing, validates sources, real "preview sample token" (decoded, unsigned display).
- Cloud Logging: provider toggles (Datadog, Better Stack, custom HTTP/syslog), credentials stored via the vault, real "recent shipped events" from the shipper's own log. Remember: shipping is an interface with zero default implementations — only enable what actually exists.

### Tier 4 — AI admin (read-only, always)
AI Assistant, Weekly Digest, Support Assistant, Config Advisor, Ask-AI Widget, LLM Provider, Database Provider.
- `src/server/ai/` exposes **only** an allowlisted set of read-only query templates executed on `READONLY_DATABASE_URL` (SELECT-only role). The model chooses a template and parameters; it never writes SQL freehand. Add a test that proves the read-only role cannot write.
- Every answer shows its citation chip from the real query (`audit_events · 3 rows`), generated by code, not by the model.
- LLM Provider: real provider abstraction (Anthropic, OpenAI, Azure OpenAI, OpenAI-compatible/self-hosted), model, max tokens, temperature, fallback on error/timeout, RPM limit, real usage counters. API keys come from the secrets layer. The model names shown in the prototype are placeholders — populate options from provider config, do not hardcode a stale list.
- Weekly Digest: scheduled job (cron-style, configurable day/time/timezone), recipients, email delivery, history stored; a quiet week renders as two lines.
- Support Assistant: single-user scoped lookup, escalation when it cannot resolve; ticketing integrations (Zendesk/Intercom/Freshdesk) behind an interface, ship only what you can really test, mark the rest "coming soon" honestly.
- Config Advisor: reads 30 days of history against current settings, produces suggestions with evidence; **Apply pre-fills the relevant field, a human still saves it**. It never writes config itself.
- Ask-AI Widget: embeddable script served from the console, verified user token, unconditional identity-filter substitution, scope checkboxes enforced server-side, per-user rate limit. Include an adversarial test suite (prompt-injection attempts must yield the same scoped query).
- Database Provider: real connection test, pool stats, latency; changing it requires step-up auth.

### Tier 5 — Settings, Secrets, Deployment
- Operators: invite, role change, remove, passkey management, session list for operators.
- Secrets: full §4 and §5 implementation, including audit entries, key rotation command, and e2e test with a virtual authenticator.
- Config view (source of each setting, redacted).
- SQLite mode: when the engine answers `501` for `/v1/admin/*`, show a clear "this deployment uses SQLite — console tables are Postgres-only" state instead of broken screens.
- Hardening: CSP, security headers, rate limiting on login/unlock, lockout on repeated failed unlock, health endpoints `/healthz` and `/readyz`, graceful shutdown, structured JSON logs to stdout.
- Packaging: production `Dockerfile` (non-root, standalone output), `docker-compose.yml`, example Kubernetes manifest with `*_FILE` secrets, GitHub Actions CI (lint, typecheck, unit, e2e, build, Docker build).

---

## 7. Verification gate (run before every commit)

```
pnpm lint && pnpm typecheck && pnpm test
```
and for any step touching UI or auth: `pnpm test:e2e`. Also, per step:
- run the app, open the screen, and check loading, empty, error and success states;
- check keyboard navigation and focus-visible on new controls;
- check a 375 px viewport (the prototype has a mobile sidebar; keep it);
- grep the diff for secrets: `git diff --cached | grep -iE "sk-ant|postgresql://|re_[A-Za-z0-9]{10}|GOCSPX"` must be empty;
- confirm no `Co-authored-by` / attribution in the message.

If a gate fails, fix it; never skip a hook with `--no-verify`.

---

## 8. README.md (open source, detailed)

Create it at the end of Tier 0 and extend it every tier. It must contain:

1. Banner (`og-image.png`), logo, tagline "Scaling Trust for digital age.", badges (license MIT, CI, Node, Go engine).
2. What csax+ is, and what it is not (relationship to the CrydenSync engine and HTTP API; self-hosted, zero telemetry, no vendor lock-in).
3. Feature list by tier, matching the sidebar groups, with a status table (done / partial / planned).
4. Screenshots (generate them with Playwright into `docs/guide/screenshots/`).
5. Architecture diagram (Mermaid): browser → Next.js server (BFF) → CrydenSync API → Postgres/SQLite; read-only role for AI; vault; passkeys.
6. Quick start: local with fixtures (`CRYDEN_MODE=fixtures`), local against a real API, Docker Compose.
7. **Configuration reference**: a table of every env var, `*_FILE` variant, config-file key, default, and whether it is secret. Explain the resolution order.
8. **Secrets and biometric unlock**: how the vault works, encryption, key rotation, how WebAuthn step-up works, RP ID/origin per environment, supported authenticators, recovery story for a lost passkey (second passkey / CLI `grant-operator`).
9. Security model: threat model summary, read-only AI guarantee, what is logged, what is never logged, responsible disclosure (`SECURITY.md`).
10. Deployment guides: Docker, Kubernetes, a PaaS, reverse proxy with HTTPS.
11. Backend compatibility and known gaps (link `docs/build/BACKEND_GAPS.md`); Postgres vs SQLite behaviour.
12. Development: repo layout, scripts, tests, how to add a screen, commit conventions (Conventional Commits).
13. Contributing (`CONTRIBUTING.md`), Code of Conduct, license, links to the engine and API repos, "Built with ❤ in Africa".

Also add: `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `docs/build/DECISIONS.md`, `docs/build/BACKEND_GAPS.md`, `CHANGELOG.md` (generated from Conventional Commits).

---

## 9. Working style for this model

- Work **one step at a time**. Before each step state in one line what you will change; after it, run the gate, then commit.
- Prefer many small files over one huge file. Keep functions short and typed; no `any`.
- When unsure about an API shape, read the reference repos; do not guess. When the repo does not answer it, record it in `BACKEND_GAPS.md` and continue with the fixtures adapter.
- **Session start:** before doing anything else, read `docs/build/PROGRESS.md` (if it exists) and continue from the first unchecked item. If it does not exist, create it with the full tier checklist (Tier 0 to Tier 5).
- **Keep `docs/build/PROGRESS.md` current:** after every commit, tick the finished step. At the end of each tier, update it with: tier status, tag created, what shipped, what is fixture-only, what is blocked on the backend, and the exact next step. Commit it (`docs(build): update progress for tier N`). This file is how a new chat resumes the work.
- **Docs layout:** `docs/guide/` holds user-facing docs (setup, configuration, secrets and biometric unlock, deployment, screenshots). `docs/build/` holds build-process docs (`PROGRESS.md`, `DECISIONS.md`, `BACKEND_GAPS.md`). Put screenshots in `docs/guide/screenshots/`.
- At the end of each tier, print: what shipped, what is fixture-only, what is blocked on the backend, and the tag you created.
- Do not claim something works unless you ran it. If you could not run it (for example, a real Face ID prompt), say so and list the manual test steps.

---

## 10. Definition of done (v1.0.0)

- All 21 screens work against a live CrydenSync API, or show an honest, specific state when the backend cannot provide the data.
- Config loads from env, `*_FILE`, or disk; the app refuses to boot with a clear error when required config is missing.
- Secrets are encrypted at rest, masked by default, revealed only after a real WebAuthn user-verification, re-masked server-side after 20 s, and every access is audited.
- AI features are provably read-only (tests included).
- CI is green; Docker image builds and runs from a clean checkout using only the README.
- Git history is clean Conventional Commits with no co-author or tool attribution lines.

---

## 11. API-first architecture, Go endpoints to add, CLI parity

This section overrides anything earlier in this file that conflicts with it.

### 11.1 Architecture

`browser -> Next.js server (BFF) -> api (/v1/*, /v1/admin/*) -> engine -> Postgres or SQLite`

- The console talks to the API only. It never holds the engine's main `DATABASE_URL`. This mirrors the CLI's API-client mode (`CSAX_API_URL`).
- Only exception: `READONLY_DATABASE_URL`, the SELECT-only role used by the allowlisted AI query templates.
- The console keeps its own small store (vault secrets, console audit entries, UI preferences). Use `CSAX_STORE_URL` for it, with its own schema and role, never the engine's primary credentials.
- Operator passkeys do not go in the console's store. The API issues them (`/v1/passkeys`, `/v1/passkeys/register/begin|finish`), and the BFF relays the ceremony, so a credential belongs to the operator's account and works wherever that account signs in. Implemented in step 1.2b; see §11.2.
- Config keys: use `CSAX_API_URL` (same name as the CLI) and `CSAX_STORE_URL`. These replace `CRYDEN_API_URL` and `DATABASE_URL` in section 3. Keep `CRYDEN_MODE=fixtures` for offline demos only.
- The topbar tag must show the real mode and health: `api-client`, `degraded`, `fixtures`, `offline`.

### 11.2 Operator login and step-up

- Operator login uses the API: `POST /v1/login`, including the paused-login completions (`/v1/login/totp`, `/v1/login/passkey/begin|finish`, `/v1/login/recovery-code`) and `/v1/refresh`. Tokens stay server-side in an encrypted session cookie, refreshed transparently, like the CLI's cached session. Admin access comes from the API ("admin required"). Read the api repo to see how admin is decided.
- Console roles `owner`, `admin`, `viewer`: if the API has no viewer concept, enforce read-only for viewers in the BFF (block every non-GET route, hide secrets).
- The API has no step-up check, so the console builds its own WebAuthn step-up (section 5) for secrets and destructive actions: reveal/add/edit/delete secrets, suspend user, force-disable MFA, change operator roles, change database provider. As of step 1.2b the console does **not** keep a credential store of its own: the assertion is verified against the passkeys on the operator's account at the API, and the console only relays the ceremony. The console's own `WEBAUTHN_RP_ID`/`WEBAUTHN_RP_NAME` are gone; the relying party is the API's.
- Face ID, fingerprint and PIN: require `userVerification: "required"`. The OS prompt uses biometrics or falls back to the device PIN. Do NOT build a separate in-app PIN.
- Section 5 "Login" and the bootstrap-token flow are superseded: the first operator is whoever the API already recognises as admin (`csax users create` plus the existing admin grant). Keep the step-up registration screen (register a passkey after login).

### 11.3 Screens that map to endpoints that already exist

| Screen | Endpoints |
|---|---|
| Dashboard | `/v1/health`, `/admin/digest`, `/admin/security/hash-migration`, `/admin/security/mfa-adoption`, `/admin/users` |
| Users, user detail | `/admin/users`, `/admin/users/{id}` |
| OAuth Providers | `/admin/oauth/health` |
| MFA & Passkeys | `/admin/security/mfa-adoption` |
| Password Policy (migration bar) | `/admin/security/hash-migration` |
| Anomalies | `GET /admin/anomalies`, `PUT /admin/anomalies/{eventID}` |
| Webhooks (delivery log) | `/admin/webhooks/deliveries` |
| Cloud Logging (recent events) | `/admin/logging/recent` |
| Weekly Digest | `/admin/digest`, `/admin/digest/history` |
| Support Assistant | `/admin/support/diagnose` |
| Config Advisor | `/admin/config-tuning` |
| LLM Provider, Database Provider, Ask-AI Widget settings | `/admin/settings/llm-provider`, `/admin/settings/database-provider`, `/admin/settings/ask-ai-widget` (GET, PUT, DELETE) |
| Ask-AI Widget runtime | `POST /v1/ask-ai` (auth required, not admin) |
| API Keys | `/v1/api-keys` (POST once, GET, DELETE) |

### 11.4 New features the prototype lacks (add them)

- **User metadata editor** in the user drawer: `GET/PUT/DELETE /admin/users/{id}/metadata[/{key}]`. Explain that metadata feeds JWT claims.
- **User actions** (CLI parity): unlock, OAuth unlink per provider, per-user sessions list / revoke / revoke-all, per-user audit tail.
- **OAuth**: provider test button and a config view (what env vars each provider needs), matching `csax oauth test` and `csax oauth config`.
- **AI Assistant modes** (all read-only): natural-language query, logs, anomalies scan (`--since 24h`), audit, ask. Matches `csax ai query|logs|anomalies scan|audit|ask` and `csax audit ask`.
- **Audit page**: search by event type, tail by user, ask in plain language.
- **System page** (new, sidebar group "System"): doctor checks, stats, health, version, migration status. Show status only. Do not expose `migrate up/down` in the UI.
- **My account** page for the signed-in operator, using the user-level endpoints: TOTP enroll/confirm/disable, passkeys list/register/delete, recovery codes generate, own API keys, own sessions (`/v1/sessions`), change password.
- **API keys**: real keys are user-owned. Drop the invented scopes unless the engine supports them. Show the raw key once.
- Update the landing page "Console" section and screen count to match what actually ships.

### 11.5 Go endpoints to add to the `api` repo

First verify each one is truly missing (read the router). Add only when the screen being built needs it, in tier order. All are admin-required, validated, audited, tested, documented, and answer `501` on SQLite where they need Postgres-only tables.

- Users: `POST /admin/users`, `POST /admin/users/{id}/unlock`, `POST /admin/users/{id}/suspend` and `/unsuspend`, `POST /admin/users/{id}/mfa/disable`, `DELETE /admin/users/{id}/oauth/{provider}`
- Sessions: `GET /admin/sessions?user=`, `DELETE /admin/sessions/{id}`, `POST /admin/users/{id}/revoke-sessions`
- Audit: `GET /admin/audit` (filters: event, user, since, cursor)
- System: `GET /admin/stats`, `GET /admin/doctor`, `GET /admin/migrations/status`
- OAuth: `GET /admin/oauth/providers` (with linked counts), `POST /admin/oauth/{provider}/test`
- Webhooks: `GET/POST /admin/webhooks`, `PUT/DELETE /admin/webhooks/{id}`, `POST /admin/webhooks/{id}/test`
- Settings: `/admin/settings/logging`, `/admin/settings/password-policy`, `/admin/settings/jwt-claims`, `/admin/settings/email-templates`, `/admin/settings/digest` (schedule, recipients), all GET and PUT
- Email: `GET /admin/email/stats`, `POST /admin/email/test`
- Operators: `GET/POST /admin/operators`, `PUT/DELETE /admin/operators/{id}` (roles owner, admin, viewer)
- AI (read-only, same safety boundary as `csax ai`): `POST /admin/ai/query`, `/admin/ai/logs`, `/admin/ai/anomalies-scan`, `/admin/ai/audit`, `/admin/ai/ask`

Rules for every endpoint:
- Follow the existing handler, middleware, error and test patterns in the repo. Do not invent new conventions.
- Schema changes go in a migration, compiled in and applied on boot like the rest.
- No AI endpoint may reach a write path.
- The landing page says admin writes are "few and deliberate: operator metadata, a review note, a settings save." The new write endpoints above change that. Update that sentence truthfully in the same step that adds the first new write.
- Every new write is audited. Destructive ones require the console step-up.

### 11.6 Working in two repos

- `api` (and `cryden` if needed) are separate git repos. Work on a branch `feat/console-admin-endpoints`. Do not push or open PRs unless asked.
- The same commit rules apply there: Conventional Commits (`feat(admin): add sessions endpoints`), one commit per endpoint group, tests included, no co-author or attribution lines, no em or en dashes.
- In the console, the commit that uses a new endpoint says which api commit it depends on, and `docs/build/PROGRESS.md` lists api endpoints as done, in progress, or pending.
- Remove an item from `docs/build/BACKEND_GAPS.md` only when the endpoint exists and the console calls it for real.
