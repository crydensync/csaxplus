# Backend gaps

What the console needs but the backend does not provide yet, plus every place where the
prototype's claims do not match the engine or the API. Remove an item only when the endpoint
exists and the console calls it for real.

Evidence comes from a read of `../_reference/api` (Go HTTP layer) and `../_reference/cryden`
(Go engine library).

---

## 1. Missing API endpoints

The router at `api/httpapi/router.go:143-385` registers every route under `/v1`. Everything the
brief lists in section 11.3 already exists. The section 11.5 additions do not.

Confirmed present and usable today:

- `POST /v1/login`, `/v1/login/totp`, `/v1/login/passkey/begin|finish`, `/v1/login/recovery-code`,
  `POST /v1/refresh`
- `GET /v1/health`, `GET /v1/sessions`, `POST /v1/api-keys`, `GET /v1/api-keys`,
  `DELETE /v1/api-keys/{keyID}`, `POST /v1/ask-ai`
- `/v1/admin/oauth/health`, `/v1/admin/security/hash-migration`, `/v1/admin/security/mfa-adoption`
- `GET /v1/admin/users`, `GET /v1/admin/users/{userID}`
- `GET|PUT|DELETE /v1/admin/users/{userID}/metadata[/{key}]`
- `GET /v1/admin/anomalies`, `PUT /v1/admin/anomalies/{eventID}`
- `GET /v1/admin/webhooks/deliveries`, `GET /v1/admin/logging/recent`
- `GET /v1/admin/digest`, `GET /v1/admin/digest/history`
- `GET /v1/admin/support/diagnose`, `GET /v1/admin/config-tuning`
- `GET|PUT|DELETE /v1/admin/settings/llm-provider`
- `GET|PUT|DELETE /v1/admin/settings/database-provider`
- `GET|PUT|DELETE /v1/admin/settings/ask-ai-widget`

Missing, grouped by the tier that first needs them:

| Tier | Needed for | Endpoints |
|---|---|---|
| 1 | Users actions | `POST /v1/admin/users`, `POST /v1/admin/users/{id}/unlock`, `/suspend`, `/unsuspend`, `/mfa/disable`, `DELETE /v1/admin/users/{id}/oauth/{provider}` |
| 1 | OAuth config | `GET /v1/admin/oauth/providers`, `POST /v1/admin/oauth/{provider}/test` |
| 1 | Email | `GET /v1/admin/email/stats`, `POST /v1/admin/email/test`, `GET|PUT /v1/admin/settings/email-templates` |
| 1 | Password policy | `GET|PUT /v1/admin/settings/password-policy` |
| 2 | Sessions | `GET /v1/admin/sessions`, `DELETE /v1/admin/sessions/{id}`, `POST /v1/admin/users/{id}/revoke-sessions` |
| 2 | Audit log | `GET /v1/admin/audit` (event, user, since, cursor) |
| 3 | Webhooks CRUD | `GET|POST /v1/admin/webhooks`, `PUT|DELETE /v1/admin/webhooks/{id}`, `POST /v1/admin/webhooks/{id}/test` |
| 3 | JWT claims | `GET|PUT /v1/admin/settings/jwt-claims` |
| 3 | Cloud logging | `GET|PUT /v1/admin/settings/logging` |
| 4 | Digest schedule | `GET|PUT /v1/admin/settings/digest` |
| 4 | AI admin | `POST /v1/admin/ai/query`, `/logs`, `/anomalies-scan`, `/audit`, `/ask` |
| 4 | System page | `GET /v1/admin/stats`, `/doctor`, `/migrations/status` |
| 5 | Operators | `GET|POST /v1/admin/operators`, `PUT|DELETE /v1/admin/operators/{id}` |

Until an endpoint exists, the screen either shows an honest "not available in this deployment"
state or is served by the fixtures adapter while `CRYDEN_MODE=fixtures`. A fixture is never a
silent substitute for a live call.

---

## 2. Product truths that contradict the prototype

These are not gaps to fill by writing Go. They are places where the prototype promises something
the engine or API does not have, so the console copy and controls must change.

### 2.1 API key prefix

The prototype shows `csk_live_...`; the landing page says `ck_`. The engine defaults
`Config.APIKeyPrefix` to `ck` (`cryden/config.go:348-350`) and formats the key as
`<prefix>_<hex>` (`cryden/auth/apikeys.go:133-151`). There is no `csk_live_` anywhere.

Action: use the real prefix, read from the API rather than hardcoded.

### 2.2 OAuth provider list

The engine has no fixed provider list. `provider` is an opaque string
(`cryden/auth/oauth.go:17-19`, `cryden/store/interfaces.go:295-298`). The README names six as
examples only. Neither "six" nor "five" is enforced by code.

Action: list what the deployment actually configures, via `GET /v1/admin/oauth/health`. Make the
landing page and the console agree by showing the configured set, not a hardcoded six.

### 2.3 "Rehash on next login" toggle

Real behaviour: hashes upgrade automatically on the next successful login, but only when the
stored hash is weaker (`cryden/auth/rehash.go:40-42`, `cryden/security/hasher.go:64-74`). There is
no forced re-prompt and no "must change password" flag anywhere in the engine.

Action: the prototype's toggle describes a behaviour that does not exist. Remove the toggle and
show the automatic behaviour as read-only, per BUILD_NOTE section 1.

### 2.4 Password policy fields

Real policy (`cryden/security/passwordpolicy.go:15-42`): `MinLength` (8), `MaxLength` (72),
`RequireUppercase`, `RequireLowercase`, `RequireDigit`, `RequireSymbol`, all booleans false by
default. Violation codes are `min_length`, `max_length`, `require_uppercase`, `require_lowercase`,
`require_digit`, `require_symbol`.

Not in the policy: breached-password checking (a separate injected `BreachedPasswordChecker` with
zero shipped implementations) and password history. There is no password-reuse concept anywhere.

Action: the prototype's "previous 5 password history" rule has no engine support. Drop it or mark
it unsupported. Breach checking is an interface with no implementation, so the console can only
report whether the host wired one.

### 2.5 Anomaly signal codes

The six codes (`cryden/security/anomaly.go:16-42`): `new_ip`, `new_device`, `user_failure_velocity`,
`ip_failure_velocity`, `token_reuse`, `concurrent_sessions`. Credential stuffing adds
`account_spray` and `unknown_account_spray` (`cryden/security/stuffing.go:11-39`).

The prototype's pills read "new country" and "lockout", which are not signal codes.

Action: render the real codes. "New country" would need an IP geolocator, which is an interface
with zero implementations.

### 2.6 Sessions are not Redis-backed

Sessions live in the store (Postgres / SQLite / memory). Redis appears only as an optional rate
limiter (`cryden/security/redisratelimiter.go`). The prototype's "Rate limiter: Redis, 3 nodes"
card must reflect what the deployment configured, not a fixed claim.

Named sessions are computed on read from IP and User-Agent
(`cryden/session/named.go:36-42`), so no migration is needed for device names.

### 2.7 Email

The engine sends no email. `notify.EmailSender` has exactly one method,
`SendVerification(ctx, to, rawToken)` (`cryden/notify/email_sender.go:5-13`), and
`MagicLinkSender` mirrors it. There are no templates and no template variables; the host composes
everything.

Action: the prototype's Resend integration and `{{user_email}}` / `{{action_url}}` /
`{{app_name}}` / `{{expires_in}}` variables are not real. Delivery stats and template editing
need new API endpoints, and even then the variables are the console's own convention, not the
engine's.

### 2.8 Cloud logging

The engine ships zero vendor loggers by design (`cryden/logger/logger.go:10-11`, README:439).
Datadog, Better Stack and syslog sinks do not exist. `GET /v1/admin/logging/recent` exists in the
API, but there is nothing to ship to until the host wires a `Logger`.

Action: only offer providers the deployment actually has. Copy that implies Datadog is "connected"
must be data-driven.

### 2.9 Force-disabling MFA

The engine has no admin override. `DisableTOTP` and `DeletePasskey` both require the user's
current password (`cryden/auth/mfa.go:106-128`, `cryden/cryden.go:339`). There is no `force`
path in non-test code.

Action: "force-disable MFA" is a new API endpoint plus an engine capability. Until both exist,
the console must not offer it.

### 2.10 User metadata

The engine's `store.User` has no metadata field (`cryden/store/interfaces.go:10-18`). The API adds
a Postgres-only `user_metadata` table and a `usermeta.ClaimsProvider` that feeds JWT claims
(`api/main.go:764-769`). So metadata exists, but only at the API layer, and only on Postgres.

Action: the metadata editor maps to the existing `/v1/admin/users/{id}/metadata` routes. It must
state that it feeds JWT claims, and must be unavailable on SQLite.

---

## 3. SQLite behaviour

The API, not the engine, owns backend selection: `DATABASE_URL` and `SQLITE_PATH` are mutually
exclusive and exactly one is required (`api/config/config.go:349-353`). On SQLite,
`AdminOnly` answers `501 not_implemented_on_sqlite` for every `/v1/admin/*` route without
inspecting the token (`api/httpapi/middleware.go:145-151`).

Action: when the console sees a 501 with that code, it renders a clear "this deployment uses
SQLite, the console's tables are Postgres-only" state rather than a broken screen.
