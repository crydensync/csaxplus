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
| 1 | Users actions | BUILT on the api branch `feat/console-admin-endpoints` (commit d0afb8f, not yet merged or deployed): `POST /v1/admin/users` (create), `POST /v1/admin/users/{id}/unlock`, `/suspend`, `/unsuspend`, `/revoke-sessions`, `/mfa/disable`, `DELETE /v1/admin/users/{id}/oauth/{provider}`. The console half (step 1.2c) wires these into the Users screen |
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

Done on the landing page (step 0.7): the card reads "OAuth, any provider" and says the engine
treats a provider as an opaque string. The console's OAuth screen still owes the configured list
from `/v1/admin/oauth/health` (tier 1, step 1.3).

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

Done on the landing page (step 0.7): the card states the real defaults (eight to seventy-two
characters, composition rules off) and no longer claims NIST 800-63B. The Password Policy screen
(tier 1, step 1.6) reads and writes the real policy and shows the real violation codes.

### 2.5 Anomaly signal codes

The six codes (`cryden/security/anomaly.go:16-42`): `new_ip`, `new_device`, `user_failure_velocity`,
`ip_failure_velocity`, `token_reuse`, `concurrent_sessions`. Credential stuffing adds
`account_spray` and `unknown_account_spray` (`cryden/security/stuffing.go:11-39`).

The prototype's pills read "new country" and "lockout", which are not signal codes.

Action: render the real codes. "New country" would need an IP geolocator, which is an interface
with zero implementations.

Done on the landing page (step 0.7): the anomaly card names the six real codes in chips, and the
credential-stuffing card names `account_spray` and `unknown_account_spray`. The Anomalies screen
(tier 2, step 2.2) renders the same codes from the API's own data.

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

### 2.11 Webhook delivery is the API's, not an unshipped interface

The engine's `Config.Webhooks` is `notify.WebhookSender` and the engine ships no implementation
(`cryden/config.go:109-119`): it makes no outbound HTTP call, so the endpoint, signing and retries
belong to the host. The host does implement one: `api/webhook/sender.go` is `notify.WebhookSender`
for this API, with a delivery log behind `GET /v1/admin/webhooks/deliveries`.

The prototype's landing page listed webhook delivery alongside breach checking and IP geolocation
as "interfaces with zero implementations". That is true of the engine library and false of the
product a reader is looking at.

Action: claim it correctly, and keep the distinction visible: the engine lets a host ship events
somewhere, and this API ships them to the endpoints the deployment configured. Done on the landing
page (step 0.7). The Webhooks screen (tier 3, step 3.2) shows real deliveries.

### 2.12 There is no `csax` CLI

The prototype's landing page listed `csax ai ask "which accounts locked out this week?"` as a
command the console replaces. No such binary exists in either repository, and this console has no
CLI entry point. `cryden/ai/types.go` is explicit that the engine holds only the pure logic and
that "csax owns the actual CLI commands", which is a statement about intent, not about a command
that runs.

Action: removed from the landing page (step 0.7), which now lists only `go run
./cmd/grant-operator` and `api migrate --baseline`, both read from the API repository. If a CLI is
ever wanted, it is new work with its own step, not something to advertise first.

### 2.13 The dashboard's four tiles and its activity panel

The prototype's dashboard shows four tiles (Total users, Active sessions, MFA adoption, and a hash
upgrade bar), a Recent activity panel, and a digest card. Three of those have no honest source on
this API, and the substitutions are recorded here because each one changes what the screen claims.

**Active sessions.** There is no `GET /v1/admin/sessions` (section 1, tier 2), and the console's
own session is an operator's, not a count of everyone's. A tile reading zero would be a claim the
console has not earned, so the tile is not rendered at all. It returns in step 2.1, from the
endpoint that makes it a count rather than a guess.

**MFA adoption as a percentage.** `mfaFactorDTO` (`api/httpapi/security_handlers.go`) counts
*events*, and says so in its own comment: an operator who enables TOTP, loses their phone and
disables it contributes one enrolment and one removal while being enrolled zero times over. There
is no numerator and denominator here that produce a share of users, so no percentage is derived.
The two tiles that replaced it report enrolments and removals in the API's window, both directions,
with the window named from the answer's own `window_days`.

**Recent activity.** There is no `GET /v1/admin/audit` (section 1, tier 2), and no other endpoint
returns a feed of things that happened. The panel became **Newest accounts**, taken from the same
`GET /v1/admin/users?limit=5` call that supplies the total, which the API already returns newest
first. It is real data and it is honest about what it is: who joined, not what anyone did. The
activity feed arrives in step 2.3 with the audit endpoint.

Action: none for the API. All three are the console declining to render a number it cannot read.

### 2.14 The digest's prose is the API's, and one dash in it reaches the screen

`GET /v1/admin/digest/history` returns the text the engine rendered when the run happened
(`cryden/admin/digest.go`, `Text()`), stored verbatim and returned unchanged. The console prints it
as text inside a `pre` block, never as markup.

That text is the one place a dash the console did not write can appear on screen: the engine's
header line is `Security digest` followed by an em dash and the window. Ground rule 7 forbids em
dashes in what this repository authors, which is not the same thing as what it renders, and
rewriting the engine's report before showing it would make the console's digest differ from the
stored one. Recorded so the character is not mistaken for a lint failure that slipped through.

## 3. SQLite behaviour

The API, not the engine, owns backend selection: `DATABASE_URL` and `SQLITE_PATH` are mutually
exclusive and exactly one is required (`api/config/config.go:349-353`). On SQLite,
`AdminOnly` answers `501 not_implemented_on_sqlite` for every `/v1/admin/*` route without
inspecting the token (`api/httpapi/middleware.go:145-151`).

Action: when the console sees a 501 with that code, it renders a clear "this deployment uses
SQLite, the console's tables are Postgres-only" state rather than a broken screen.

---

## 4. Found while building operator sign-in (step 0.5)

Read from `api/httpapi/auth_handlers.go`, `session_handlers.go`, `totp_handlers.go`,
`passkey_handlers.go`, `recovery_handlers.go` and `api/openapi/spec.yaml`.

### 4.1 `POST /v1/login` does not say which session it just created

The success answer is `{access_token, refresh_token}` (`auth.Tokens`,
`cryden/auth/token.go`, which has exactly those two fields). Signing out needs the other
direction: `POST /v1/logout` takes `{session_id}` and answers `403 session_not_owned` for a
session the caller does not own.

So the console signs in, then calls `GET /v1/sessions` and takes the entry with the newest
`created_at` as its own. That is a guess about which of the account's sessions is the new one,
and it is wrong whenever two sign-ins land inside the same second (`created_at` is RFC3339 to
the second) or when the API's clock and the console's disagree.

Action: return the created session's `id` in the login answer, and in the answers of
`/v1/login/totp`, `/v1/login/recovery-code` and `/v1/login/passkey/finish`, all of which mint a
session the same way. `newestApiSessionId` in the console (`src/server/auth/flow.ts`) is the only
place that has to change.

Until then the console degrades rather than pretending: when the list cannot be read, the
session records `apiSessionId: null` and signing out clears the console cookie while reporting
`revoked: false`, so the operator is told the API-side session outlives them.

### 4.2 Nothing says which operators may manage other operators

The console's `owner` role has no source. The API's `operators` table carries one string per
user and the only value any code tests for is `"admin"` (`RequireAdmin`,
`api/httpapi/middleware.go`). `GET /v1/admin/operators` is in the missing list in section 1, and
until it exists `owner` is unreachable in the console. See DECISIONS.md D10.

### 4.3 The second-factor endpoints are not in the OpenAPI document

`/v1/login/totp`, `/v1/login/recovery-code`, `/v1/login/passkey/begin`, `/v1/login/passkey/finish`
and the OAuth, magic-link and passkey-registration routes are registered in
`api/httpapi/router.go` but absent from `api/openapi/spec.yaml`. Their request and response
shapes were read from the handlers instead, and every one is checked with `zod` on the way in
(`src/server/auth/api-auth.ts`), so a change on the API's side shows up as a named failure
rather than a screen reading a field that is no longer there.

Action: add them to the spec. Not a blocker.

### 4.4 WebAuthn is never a primary login

There is no standalone passkey sign-in. `POST /v1/login/passkey/begin` requires a
`pending_token`, so a passkey can only finish a login that a password already started. A
passwordless account cannot sign in at all through this API. The sign-in screen therefore asks
for the password first and offers a passkey only as one of the pause's methods, which is what
the API can actually do.

### 4.5 `GET /v1/health` says almost nothing

`HealthHandler.Health` (`api/httpapi/health_handler.go`) pings its own database and answers
either `{"data": {"status": "ok"}}` or a 503 with `db_unreachable`. That is the whole answer:
no version, no build, no database engine, no migration state, no uptime.

Action: the prototype's topbar tag read "connected, production db". The console cannot honestly
say the second half, so its tag says `api-client` and the sentence behind it claims only that
the API answered and reported itself healthy. Do not add a database or environment claim to the
console until the endpoint reports one. A `version` and a `database` field here would also give
the System page (tier 4) something real to show.

### 4.6 The health handler's documented nil behaviour is not implemented

`Deps.DB`'s comment says a nil database is fine and `/v1/health` "then reports the database as
unconfigured rather than panicking" (`api/httpapi/router.go:35-37`). `HealthHandler.Health` has
no nil check and calls `h.DB.PingContext` directly, and that call panics on a nil `*sql.DB`.
`net/http` recovers the panic per connection, so the caller sees the connection drop with no
response at all rather than a status.

The impact is limited to a router built without a database, which is what the comment is about
(tests). Recorded because the console reads a dropped connection as `offline`, which is the
wrong word for "this router has no database wired", and because the comment will otherwise be
trusted again.

Action: either guard the handler and answer `{"data": {"status": "unconfigured"}}`, or correct
the comment. Not a blocker for the console.

### 4.7 A `viewer` console account has nothing it may read on this API version

`RequireAdmin` (`api/httpapi/middleware.go:80-85`) refuses any token whose `role` claim is not
literally `"admin"`, and every route under `/v1/admin` goes through it on Postgres. The claim is
set by `main.go`'s `AccessTokenClaims` provider from `operator.Store`, and an ordinary end user's
token carries no `role` claim at all. Its doc comment is explicit that "an unknown user, a revoked
operator, and someone who was simply never an operator all fail identically here", and that "that
distinction is not the caller's to learn".

So the console's `viewer` role is real but currently reads nothing: such an account signs in
successfully and every admin report answers `403 not_operator`. The console renders that as one
state, worded as the API refusing the reports rather than the person, and does not try to tell the
cases apart, because the API deliberately does not say which one it is.

Action: none for the API, and none for the console in tier 1. When a tier 2 or 3 screen has a
surface a viewer may legitimately read, that endpoint should be registered on the engine's ordinary
authenticated middleware rather than `AdminOnly`, and this entry should be revised to say which.


---

## 5. Found while building the Users screen (step 1.2)

### 5.1 The list searches one exact address, and nothing else

`GET /v1/admin/users` takes `email` and matches it exactly and case-sensitively. There is no
partial match, no search over other fields, and no free-text parameter. The engine is the reason:
`operator.Store` looks accounts up by primary key or by exact email, so a substring search would be
a new query shape and a new index rather than a parameter on an existing one.

The prototype's search box implies the other thing, and the two look identical when a search
misses. The console therefore labels which one answered: the API returns a `match` field
(`browse` or `exact_email`) and the screen turns it into a sentence under the table, and a miss is
worded as a search that found nothing rather than as an account that is gone. See DECISIONS.md D19.

Action: none for the API in tier 1. A `q` parameter over email and id would be additive and
backwards compatible if a later tier wants it; until then the console says what it did.

### 5.2 Three of the prototype's user columns have no endpoint behind them

The prototype's table has Provider, MFA and Last seen. Nothing in the API answers any of them for a
list of accounts:

- **Provider** is per-account OAuth links. There is a `DELETE
  /v1/admin/users/{id}/oauth/{provider}` in tier 1's missing list and no read alongside it, so a
  Provider cell could not be filled even once the unlink route exists.
- **MFA** is per-account factors. `GET /v1/admin/security/mfa-adoption` counts enrolment and removal
  events across the deployment, which is the dashboard's report and not a per-user fact. The
  engine's per-user factor read is `cryden/auth/mfa.go`'s own user-facing path, which needs the
  account's password.
- **Last seen** needs a last-login instant. `store.User` carries `CreatedAt` and `UpdatedAt` and no
  such field; `updated_at` moves for any change to the account, so it is not a substitute.

Action: the three columns are not rendered, and the table shows the fields the API sends
(DECISIONS.md D19). Each returns when an endpoint answers it, not before.

### 5.3 The detail endpoint counts a user's sessions rather than listing them

`GET /v1/admin/users/{userID}` answers `active_sessions` as a number. There is no per-user session
list until `GET /v1/admin/sessions` exists in tier 2 (section 1), and the console's own
`GET /v1/sessions` is the signed-in operator's own sessions, which is a different account's data and
is not this endpoint's to publish.

So the drawer says how many sessions are live and says that it cannot say more, naming the reason in
the copy rather than leaving a bare integer to be read as a list that failed to load. Action: none
for the API; the count is real and the screen is explicit about what it is.
