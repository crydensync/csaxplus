# Decisions

Choices made while building, and why. Section 1 of BUILD_NOTE.md requires any departure from the
suggested stack to be written here before it is made, rather than switched silently.

---

## D1. Styling: one global token stylesheet plus React components, not Tailwind and not CSS Modules

**Date:** 2026-10-04
**Status:** accepted (supersedes the CSS Modules wording of the first draft)

BUILD_NOTE.md section 1 allows "Tailwind v4 (or CSS Modules)" and requires the token names to be
kept. We take neither, and this entry records why.

Reasons:

1. The prototype's `styles.css` is 783 lines of hand-tuned CSS. Porting it to utility classes would
   rewrite every screen's markup and risk drifting from the visuals the brief says to keep.
2. The token names (`--violet`, `--surface`, `--border-soft` and the rest) are already a complete
   design system. They move into `globals.css` unchanged and every component reads them.
3. The console is one application with one visual language. Scoping each rule into a CSS Module
   would split a single system across a dozen files and make it harder to see that the tokens are
   applied consistently.
4. Keeping the prototype's class names makes porting the remaining screens mechanical: the markup
   in `index.html` maps to React with the same class names, so a reviewer can diff the two.

The rules live in `src/app/globals.css`, grouped by the same section comments the prototype uses.
`src/components/` holds typed React wrappers (`Card`, `Pill`, `Button`, and so on) so that screens
compose components rather than pasting class strings. A component that needs a new rule adds it to
the matching section of `globals.css` instead of inventing an inline style.

Tailwind is not installed. Keeping a dependency that no component uses would be dead weight, so
this choice is all-or-nothing rather than a hedge. A future screen that wants utilities should
revisit this entry rather than add the package quietly.

---

## D2. Next.js 15, not the newer 16

**Date:** 2026-10-04
**Status:** accepted

The registry's current stable line is Next.js 16.3.x. The brief specifies Next.js 15, and the
console is written fresh against the App Router, so there is no migration cost either way. We pin
`^15.5.27` to follow the brief. Revisit when the brief is updated.

TypeScript is pinned to `^5.9.3` rather than the current 7.x line, and ESLint to `^9.39.5` rather
than 10.x, so the flat-config and type-checking behaviour matches what the brief assumes.

---

## D3. pnpm build-script approvals live in pnpm-workspace.yaml

**Date:** 2026-10-04
**Status:** accepted

pnpm 12 no longer reads the `pnpm` field in `package.json`; it warns and ignores it. The
`onlyBuiltDependencies` key was also replaced by an `allowBuilds` map. Approved build scripts are
therefore recorded in `pnpm-workspace.yaml`, which is what `pnpm approve-builds` writes.

Currently approved: `esbuild` (vitest's bundler) and `unrs-resolver` (eslint's import resolver).
Both are legitimate postinstall steps for well-known tooling. `better-sqlite3` needs no approval
because it ships prebuilt binaries.

---

## D4. The `build/` ignore pattern is anchored to the repo root

**Date:** 2026-10-04
**Status:** accepted

The supplied `.gitignore` had a bare `build/`, which matches at any depth and so also ignored
`docs/build/`. That silently excluded `PROGRESS.md`, `DECISIONS.md` and `BACKEND_GAPS.md`, all of
which BUILD_NOTE.md requires in the repository.

The pattern is now `/build/`, and the neighbouring output directories (`/.next/`, `/out/`,
`/dist/`) are anchored the same way. Nothing else about the file changed.

---

## D5. The AI layer gets a citation chip generated in code

**Date:** 2026-10-04
**Status:** proposed, to be confirmed in Tier 4

The landing page and the prototype both show a citation like `audit_events · 3 rows` under an
answer. The brief requires it to come from the real query rather than the model. The plan is for
the read-only query template to return both rows and a count, and for the route handler to render
the chip from that result. Recorded here so Tier 4 does not quietly let the model author it.

---

## D6. Four deliberate departures from the prototype's markup

**Date:** 2026-10-04
**Status:** accepted

The brief keeps the prototype's look but replaces its behaviour. Porting the design system turned
up four places where copying the markup exactly would have carried a defect across.

1. **The toggle is now operable.** `.toggle-track` was a `<span>` with `cursor: pointer`, and the
   `<input>` was `width: 0; height: 0`. Neither could be clicked, so every switch in the prototype
   was decoration. The input now spans the control (`position: absolute; inset: 0`), the track
   remains the visible artwork, and focus lands on the input with the ring drawn on the track.
   `tests/e2e/design-system.spec.ts` asserts the switch is clickable and reports its state.

2. **The sidebar footer is pinned.** `.sidebar` scrolled as one column with `margin-top: auto` on
   the operator chip. With 21 nav items that only works while the content is short; on a 620px
   viewport the chip was pushed below the fold with no way to reach it. The column is now
   `overflow: hidden`, the nav sits in a `.nav-scroll` region that scrolls, and the chip stays put.

3. **Wide tables scroll horizontally.** The prototype let columns squeeze. `.table-scroll` gives
   them `overflow-x: auto` with a floor width, and a fade on the right edge below 880px so a cut
   off column reads as "swipe for more" rather than as a broken layout.

4. **Empty, error and loading states exist.** The prototype had shipped sample data in every
   table, so it never needed them. `EmptyState`, `ErrorState`, `Skeleton` and `SkeletonRows` are
   new, and `DataTable` renders them in a fixed precedence: a failure beats loading, loading beats
   empty. A count of zero renders the empty state; it never renders a zeroed-out dashboard.

Related: the logo moved to `public/cryden-icon.png` and the banner to `public/og-image.png` as
BUILD_NOTE.md section 1 asks. The two prototype HTML files had their `og:image` reference updated
so nothing dangles.

---

## D7. The design system has a dev-only preview route at `/design`

**Date:** 2026-10-04
**Status:** accepted

Step 0.2 produces components that no screen renders yet, so there was nothing to look at and
nothing honest to point a test at. `/design` renders every component in every state inside the real
shell, and `tests/e2e/design-system.spec.ts` drives it.

The route calls `notFound()` when `NODE_ENV` is `production`, so a production build answers 404
for it. Confirmed against a real build: the prerendered output is the error page with
`meta name="robots" content="noindex"`.

It is not linked from the console navigation and is not part of the operator's surface. Tier 0.7
adds the real landing page at `/`; the console dashboard lives at `/dashboard`, since the two
route groups cannot both own the root path.

---

## D8. The config loader resolves provenance, never values

**Date:** 2026-10-04
**Status:** accepted

Every setting is resolved through one function, in the order the brief fixes: the environment,
then a `*_FILE` indirection, then the disk config file, then the default. `ConfigSource` therefore
has four values (`env`, `env-file`, `file`, `default`) rather than three, because "the value was
mounted as a file" and "the value was written into the environment" are operationally different
answers when an operator is asking why a setting is what it is.

Choices worth recording:

1. **JSON only, and TOML refused loudly.** The brief allows a TOML config file. A TOML parser is a
   dependency carried for a fallback path only, so the loader accepts `.json` and throws a
   `ConfigError` naming the path for anything else. It does not silently ignore a file the
   operator wrote, which would boot the console on defaults while they believe otherwise.

2. **A blank environment value means unset.** `CSAX_API_URL=` in a `.env` file falls through to the
   next source rather than producing an empty string. An empty setting in a dotenv file is far
   more often a leftover line than a deliberate value, and the alternative is a validation error
   naming a variable that looks set.

3. **A missing file is fine; an unparseable one is fatal.** `csax.config.json` is absent on most
   machines and that is not an error. A file that exists and is not valid JSON stops boot, for the
   same reason as above.

4. **SQLite under the working directory when nothing is configured.** The engine requires exactly
   one store and refuses to guess. The console is a small operator tool, so it defaults to
   `.csaxplus/console.sqlite` and lets a checkout run with no database. Both store targets set at
   once is still an error, matching the engine.

5. **`process.getBuiltinModule` instead of `import "node:fs"`.** Next compiles `instrumentation.ts`
   for the edge runtime as well as Node, and its bundler follows a dynamic import even behind a
   `NEXT_RUNTIME === "nodejs"` guard: a static `node:fs` import in the config loader failed the
   edge compile with `UnhandledSchemeError` for code the edge never runs. Fetching the builtin at
   call time through `process.getBuiltinModule` (Node 22.3+) keeps the import graph clean. A
   webpack `resolve.alias` in `next.config.ts` was tried first and does not apply to
   instrumented files.

6. **Boot-time validation fails fast.** `loadConfig()` throws a single `ConfigError` listing every
   bad or missing key at once, each with a reason derived from the zod issue code rather than from
   the issue message, so no value can leak into the output: a test asserts that a short vault key
   does not appear in the error text. `register()` prints that message and exits `1`, in
   development and in production alike. Verified both ways: `next dev` prints the list and stops,
   and `next start` exits `1`.

   Two guards sit in front of it. The check runs only when `NEXT_RUNTIME` is `nodejs`, since the
   edge runtime has no configuration. It also skips `phase-production-build`: a build machine
   collects pages but serves nobody, and is not required to hold the deployment's secrets.

`describeConfig()` returns `{key, source, sensitive}` and nothing else. The Settings screen in
Tier 5 shows where each value came from; it never has a value to show.

---

## D9. Two hand-written schemas, and migration SQL as the source of truth

**Date:** 2026-10-04
**Status:** accepted

The console store runs on Postgres or SQLite, the same schema either way. Both
drizzle cores are used for typed queries, which means writing the schema twice:
`schema.postgres.ts` and `schema.sqlite.ts`. The alternatives were a generator
that emits both from one description, or dropping the ORM and writing SQL by
hand. Both were rejected for the same reason. A generator defeats drizzle's
column inference, which is the whole reason to use it, and hand-written queries
have to solve `?` against `$1` themselves, which is the second reason. The
duplication is real, so a test holds the two copies together: `shape.ts` projects
each dialect onto one neutral description and `tests/unit/db-store.test.ts`
fails on any difference. A third representation, the DDL, is bound to the typed
schema by introspecting a database the migrations actually created.

`uuid` is not a neutral kind. Postgres stores an id as `uuid` and SQLite as
`text`, holding the same value; treating one as the exception would report a
difference that does not exist. The neutral kinds are the five both engines
share: text, integer, boolean, timestamp, json.

More decisions in this step:

1. **Migration SQL is the source of truth for the schema.** The typed schema
   exists so queries are checked, not so it can generate DDL. There is no
   drizzle-kit in the build.

2. **Migrations are append-only, and each is one transaction.** Editing an
   applied migration does nothing on a deployed console, so a correction is a
   new one. The row recording a migration is inserted by the same transaction
   that created its tables, so a crash cannot leave a migration marked applied
   when it is not. A test proves a failing batch leaves no table behind.

3. **`runAtomically` takes steps, not statements.** The runner needs DDL plus a
   parameterised insert. The obvious next move, a general `transaction(fn)`
   wrapper, was not taken: the vault and the passkey store will want one, and
   inventing it before something needs it means guessing at its shape. On SQLite
   the callback runs synchronously inside better-sqlite3's transaction, and on
   Postgres it runs inside `postgres.begin`, which checks out a single
   connection; sending `BEGIN` over the pool would put the `COMMIT` on a
   different connection.

4. **Every driver module is loaded at call time, with no specifier a bundler can
   see.** `drizzle-orm/better-sqlite3` statically requires `better-sqlite3`,
   which requires `fs` and a native binding. Next compiles `instrumentation.ts`
   for the edge runtime as well as for Node, and importing that chain at all,
   statically or with `import()`, failed the edge compile with `Can't resolve
   'fs'` for code the edge never runs. `runtimeRequire` in `builtins.ts` hides
   both the package and the drizzle entry point. This is the same constraint
   that shaped `sources.ts`; that file now shares the helper.

5. **`?` placeholders are rewritten to `$1` for Postgres.** A repository written
   once runs on both engines. The rewrite is a substitution, not a parser, so a
   literal question mark inside a string would be miscounted. No statement the
   console writes has one, and a test records the limit rather than implying the
   translation is smarter than it is.

6. **SQLite ids are declared `primary key not null`.** SQLite's `primary key`
   does not imply `not null` on a text column, a long-standing compatibility
   quirk that permits several NULL ids in the same table. Saying `not null`
   removes it, and the Postgres side is not-null either way.

**What is verified, and what is not.** Both dialects are now run for real. The
SQLite path executes in `tests/unit/db-store.test.ts` and against the built
server; the Postgres path executes in `tests/unit/db-postgres.test.ts` against
PGlite behind `pglite-socket`, and against the built server booted on
`CSAX_STORE_URL`. That second half arrived in step 0.10 and is D17; at the time
this decision was written the Postgres statements were only typed and compared,
because there was no Postgres server in this environment and no Docker daemon to
start one.

---

## D10. The console reads the API's one role bit, and leaves `owner` unreachable

**Date:** 2026-10-04
**Status:** accepted, pending an API endpoint

The console has three roles, `owner`, `admin` and `viewer` (BUILD_NOTE 5). The
API has one: a row in `operators(user_id, role)` whose only meaningful value is
the literal `"admin"`, which is what `RequireAdmin` tests for; an ordinary user
carries no `role` claim at all. So the console maps `role === "admin"` to
`admin` and everything else, including a missing claim, to `viewer`.

`owner` is not reachable yet, and no code path can produce it. It is meant for
whoever may manage other operators, and the endpoint that would answer that
question, `GET /v1/admin/operators`, does not exist in the API. The alternative
was a console-side list of owner ids in configuration, which would be a second
source of truth for a fact the API owns, and would disagree with the API from the
moment a role changed there. Mapping one bit to two roles and leaving the third
unreachable keeps the API the only authority, at the cost of a role that exists
in the type system and in no session. Recorded in BACKEND_GAPS.md as the
endpoint that would make it reachable.

The console does not verify the access token's signature and holds no signing
key: `JWT_SECRET` is the API's, and BUILD_NOTE 11.1 forbids the console holding
the engine's credentials. It reads `sub`, `role` and `exp` to decide which
screens to draw, and the API verifies the same token on every real call. So a
forged claim could change what a screen looks like and nothing else. A test
pins the mapping, including that a token whose payload is not JSON is a failure
of the API's answer rather than a signed-out operator.

---

## D11. Signing out clears the console cookie always, and revokes the API session when it can

**Date:** 2026-10-04
**Status:** accepted

Signing out does two things that can disagree: the console forgets the session,
and the API's session stops existing. The console does both, and reports which
happened.

`POST /v1/login` returns tokens and no session id, but `POST /v1/logout` takes a
`session_id` and refuses one the account does not own. So the console asks
`GET /v1/sessions` immediately after signing in and records the newest as its
own, or records `null` when that call fails. Revoking is then best effort: an API
that cannot be reached, or a session id that was never resolved, must not leave
the operator still signed in to the console, because the cookie is the console's
own state and clearing it is the console's own decision. So the cookie is cleared
either way and the answer carries `revoked`.

The browser is told, rather than shown a sign-in screen as if all were well. When
`revoked` is false the sign-out button stays on the page and says the API session
is still live until it expires on its own, because a refresh token that outlives
the browser session is worth knowing about. Navigating away would render that
sentence for one frame and then lose it.

Two smaller points. Signing out is guarded by origin and CSRF but not by role: a
viewer is read-only, not trapped, and ending your own session is not a privileged
change. And the console's session id (`sid`) is separate from the API's
(`apiSessionId`): the first identifies the console's own cookie for the audit
entries the console writes, the second is the handle the API recognises, and
conflating them would make a console-side id look like a credential it is not.

---

## D12. The fixtures adapter is chosen by configuration and can never look connected

**Date:** 2026-10-04
**Status:** accepted

`CRYDEN_MODE` picks the adapter, and nothing else does. Fixtures are not a
fallback for a live call that failed, not a request-level choice, and not
something a screen can ask for: `crydenClient()` reads the mode from config and
returns one of two objects. A live call that fails stays failed and the screen
says so, which is the rule BUILD_NOTE section 1 exists to protect.

The enforcement is partly in the types. `FixtureHealth` is `{state: "fixtures"}`
and cannot be `api-client`, so the fixtures adapter is unable to claim a real
connection even by mistake, and `LiveHealth` has no `fixtures` member so a live
console cannot claim sample data. Two tests assert the runtime behaviour on top
of that, because the sentence an operator reads before trusting a screen is worth
asserting twice.

The interface is deliberately thin: `health()` today, one method per endpoint as
a tier needs it. A client that listed every `/v1/admin/*` route now would be a
guess at request and response shapes for screens that do not exist, and the guess
would be wrong in the same way the prototype's canned data was wrong.

The topbar asks on every render rather than caching. A cached tag describes a
connection that may already be gone, and the four states are the console's only
claim about the backend, so it is worth one round trip with a three second
timeout (shorter than the transport's ten) on each screen.

---

## D13. Two routes that must not answer with the wrong thing

**Date:** 2026-10-04
**Status:** accepted

**A sidebar link is a promise the route exists.** The navigation lists every
screen in the brief, because hiding unbuilt screens would hide the work left to
do. Following one used to land on a 404 that looks like a broken console, so
`(console)/[...slug]` renders a named "not built yet" state for the routes the
navigation actually contains. A path that is not one of them still answers 404:
without that check the catch-all would tell an operator that a mistyped URL is
"coming in a later tier", which is a different and worse kind of untrue. Each
tier needs no change here, since a page that adds its own route takes precedence.

**An unmatched path under `/api` answers JSON.** The console's own endpoints live
there, and without a catch-all an unknown one fell through to the page route
above and answered a 307 into the sign-in screen: HTML and a redirect, to
something that asked for JSON. `api/[...slug]` answers a 404 envelope for every
method, so the API surface is closed and a wrong URL is legible to a caller.


---

## D14. The landing page is static, and its claims come from the console itself

**Date:** 2026-10-04
**Status:** accepted

`/` is the landing page, ported from `landing.html`. It reads no cookie and calls no API, so a
signed-out visitor and a signed-in operator get the same bytes, and the page is the only static
route in the app. Its one action, "Open console", points at `/dashboard`, which is where the
console already decides between the dashboard and the sign-in screen; personalising the button by
reading the session would have cost the static render for a word.

**The console map is generated from the navigation.** The prototype listed its screens by hand,
which is how its own list and the sidebar drifted into different groups. The section now renders
`NAV_GROUPS`, so the marketing page cannot promise a screen the console does not have, and the
heading's count is computed from the same array rather than typed. `NavItem` gained one optional
field, `readOnly`, set on the four AI screens: BUILD_NOTE's read-only invariant is the strongest
claim the product makes, and a claim like that belongs on the item it describes rather than in a
paragraph that can drift away from the screens. The e2e spec walks the two lists against each
other, item by item, tag by tag.

**The copy was reconciled with the Go source rather than copied.** Five of the prototype's claims
did not survive being checked, and each was rewritten instead of carried: the fixed list of six
OAuth providers (the engine treats a provider as an opaque string, BACKEND_GAPS 2.2); "NIST 800-63B
rules" for a policy whose real defaults are 8 to 72 characters with every composition rule off
(2.4); "webhook delivery ships as an interface with zero implementations", which is true of the
engine and false of the product, because the API implements a sender (2.11); `Go 1.22+`, where both
repositories declare `go 1.25.0`; and `csax ai ask "..."` in the list of commands the console
replaces, a command that exists nowhere (2.12). The numbers that were left alone were checked
against the source first: five attempts and fifteen minutes is `Config.LockoutThreshold` and
`LockoutDuration`, the seven registered claim names are `token/claims.go`'s reserved set, and the
21 screens are the real navigation.

**No `og:image`, on purpose.** A relative image is resolved against `metadataBase`, which needs an
absolute origin. The only origin the deployment knows is `WEBAUTHN_ORIGIN`, which is validated at
boot and unavailable to a build that has no runtime secrets, so the image URL would have been
`localhost` in a production container. Announcing the wrong host is worse than announcing none, so
the prototype's `og-image.png` waits for the tier 5 deployment work that gives the console a public
origin (step 5.5). The asset stays in `public/`.

**Accessibility is measured, not asserted.** The page is a landmark per region (`header`, `main`,
two labelled `nav`s, `footer`), it opens with a skip link whose target is focusable, and every icon
is hidden from assistive technology because each one sits beside its own label. The prototype's
decorative headings were also drawn in `--text-dim`, which measures 2.95:1 against the page
background, under AA for text; every text colour on the page is now a token that passes, and the
one illustration that keeps dim is `aria-hidden` and labelled "example data" in its own title bar,
so nothing on the page can be mistaken for a reading from a real deployment.

---

## D15. The README has no CI badge yet

BUILD_NOTE section 8 asks the README's badge row for four things: license, CI, Node and the Go
engine. Three of them are static facts and are there. The fourth is not: the GitHub Actions
workflow arrives in step 5.6, and a shields.io CI badge would point at a workflow run that does not
exist. It renders as "no status", which reads as a failing build to anyone who does not click it.

There is no build to report yet, so the badge is left out and the absence is explained in the
README itself rather than left for a reader to notice. Step 5.6 adds the workflow and the badge
together, which is the only order in which the badge means anything.

The other three badges were checked before they were written: MIT is `LICENSE`, Node 22 is
`package.json`'s `engines`, and Go 1.25 is what `cryden/go.mod` and `api/go.mod` both declare. The
prototype said "Go 1.22+", which was wrong (BACKEND_GAPS 2.2's sibling correction on the landing
page). Postgres 13 is a fourth badge, from the engine's README: `gen_random_uuid()` is built in from
13.

## D16. What running the production build found

The tier 0 gate runs `pnpm test:e2e` against a dev server. Tier 0 also builds and serves the
production output once, and that surfaced three things the dev server hides. All three were
reproduced before being written down, and the third is a deviation from D13.

**A bad key now says what is wrong with it.** `describeIssue` in `src/server/config/errors.ts` had
no case for zod's `custom` code, which is the code a `refine` produces, so the most specific
message in the schema was discarded and an operator with a truncated secret read:

```
  CSAX_SESSION_SECRET: is not valid
```

The refine's own message, `must be 32 bytes, base64 encoded (session cookie signing)`, was written
to be actionable and value-free and was never reaching anybody. Fixed in its own commit, with a
test that holds it. Every refine in the schema is written the same way, so printing `issue.message`
cannot leak a value.

**The standalone server needs two directories copied that the build does not copy.**
`.next/standalone/` gets the server and its pruned dependencies, but `public/` and `.next/static/`
stay where the build put them. Without them the server starts, serves HTML, and every asset request
falls through to the console's catch-all and is answered with a 307 to `/login`: the page renders
unstyled and unhydrated. Verified by requesting a real stylesheet from a standalone server with no
copies (307) and from `next start` (200). Written down in `docs/guide/deployment.md`, which is where
somebody hitting it will look.

**`pnpm start` is the wrong entry point for this build.** `next start` prints
`"next start" does not work with "output: standalone" configuration. Use "node
.next/standalone/server.js" instead.` and then serves anyway. Serving anyway is worse than failing:
a deployment that works in testing and is unsupported in production is a trap. Recorded, and left
alone until step 5.6, which owns packaging; changing `start` now would break the tier 0
verification habit of `pnpm build && pnpm start` before its replacement exists.

**Deviation from D13.** D13 says `(console)/[...slug]` answers a real 404 for a path that is not one
of the navigation's routes. That holds when the caller is signed in. When they are not, the
`(console)` layout's session check runs before the page, so an unmatched path is a 307 to `/login`
rather than a 404. Reproduced against `next start`: `/robots.txt` and `/_next/static/css/nope.css`
both answer `307 -> /login`.

That is defensible for a console, where every path really is behind a sign-in, and it is only
visible to an unauthenticated caller. It is recorded because the promise in D13 is unconditional and
this is not, and because one consequence is worth fixing on its own: a crawler asking for
`robots.txt` is redirected into a sign-in page instead of being told to go away. A `public/robots.txt`
disallowing everything, which is what a private console wants, is a follow-up rather than part of
this step.

---

## D17. Running the Postgres store found two defects in code that had never executed

**Date:** 2026-10-04
**Status:** accepted

D9 chose the Postgres driver and said what it was worth: typed, compared structurally against the
SQLite schema, never executed, because this environment has no Postgres server and no Docker daemon.
The decision left the fix open on purpose, and step 0.10 took it.

**PGlite behind `pglite-socket`, not PGlite on its own.** The obvious way to test a Postgres driver
without a server is to run the queries through PGlite's own client. It was rejected: the driver's
job is to be the thing that ships, and a second in-process implementation would have agreed with the
tests and could still have disagreed with a deployment. `pglite-socket` serves the real wire protocol
over TCP instead, so `openPostgresStore(url)` runs unchanged, postgres-js and all. Both packages are
development dependencies; nothing at runtime depends on them.

The socket server multiplexes several client connections onto PGlite's single backend, so its
`maxConnections` has to be at least the `max: 5` pool, and the suite resets the `public` schema
between tests rather than paying for a new WebAssembly instance per test.

**Defect 1: the postgres.js factory was read from the wrong place.** `openPostgresStore` did
`pg.default(url, ...)` on the stated assumption that `require` of the package hands back a namespace
object with the factory on `default`. It does not. postgres.js is `export = postgres`, so the
CommonJS build that `runtimeRequire` reaches returns the factory itself, and `pg.default` is
undefined. The console threw `pg.default is not a function` at the moment it opened the store, which
on Postgres is boot: `migrateOnBoot` opens the store before it serves anything. Fixed with
`postgresFactory`, which accepts either shape and says why both exist.

**Defect 2: drizzle takes postgres.js's date handling away, and the driver was relying on it.**
The migration runner passes a `Date` for `console_migrations.applied_at`. postgres.js serialises a
`Date` to an ISO 8601 string itself, so that looked fine. It is not, because `drizzle(client, ...)`
is constructed on the same client and drizzle's `postgres-js` driver runs this on the way in:

```js
const transparentParser = (val) => val
for (const type of ["1184", "1082", "1083", "1114", "1182", "1185", "1115", "1231"]) {
  client.options.parsers[type] = transparentParser
  client.options.serializers[type] = transparentParser
}
```

Those are the date and timestamp type OIDs. Drizzle replaces their serialisers with a pass-through
because drizzle converts its own column values before the driver sees them, and it wants the raw
strings back when reading so it can apply each column's own mode. The side effect is that the raw
`unsafe` path loses `Date` support entirely: the value reaches the wire unencoded and throws inside
`Buffer.byteLength`. The fix is to send the string Postgres expects, which is what drizzle sends for
its own timestamp columns anyway, and to say in the comment why a cast was not enough.

Neither defect could have been found by reading the code more carefully, and neither is visible on
SQLite. Both would have hit at boot on a Postgres deployment, which is the whole of the store's
supported production configuration.

**Left alone: the notice on every boot.** Postgres answers `create table if not exists
console_migrations` on an already-migrated store with `NOTICE 42P07 relation already exists,
skipping`, and postgres-js prints notices as a raw object on stdout. Verified by booting the built
server twice against the same database. Not fixed here: what an operator should see is the logging
policy that arrives with `LOG_LEVEL` and JSON logs in step 5.5, and inventing a filter for one
message now would be a policy chosen by accident.

---

## D18. The dashboard reads through a console route, and reports four sections rather than one result

**Date:** 2026-10-05
**Status:** accepted

The dashboard needs four admin reports: `GET /v1/admin/users`, `/security/mfa-adoption`,
`/security/hash-migration` and `/digest/history`. Three choices about how they are fetched are worth
recording, because each has a cheaper alternative that fails in a way that takes a while to see.

**A console route, not a server component.** `src/app/api/console/dashboard/route.ts` reads the four
reports and the page's client component fetches them from there. The obvious shape is for the
dashboard's server component to call the API directly, and it works right up until the access token
turns over: the API's access token lives fifteen minutes, renewal writes a cookie, and a server
component cannot write one. The screen would then show four failures until the operator signed out
and back in, which reads as a bad password rather than an expiring token. `requireSession` renews
inside a route handler and `respond` carries the `Set-Cookie` out with the answer, so the renewal
happens on whatever call the screen makes next.

The cost is that the browser fetches the console's own route, so the data is one hop further from
the page. That hop is also the reason the four states can be tested at all: the end-to-end suite
cannot intercept a server-side API call, and it can intercept this one.

**Four sections, not one result.** `dashboardOverview` returns a `Section<T>` per report instead of
throwing or returning a single value. A deployment can have accounts and no digest schedule
(`DIGEST_INTERVAL_HOURS` unset means the API's digest store is not wired, and the route answers 404
`not_configured`), or a working digest and a hasher that a future API version renames out from under
the console. One combined failure would blank three reports that arrived.

**The state is chosen by the API's code, not by the status.** `not_implemented_on_sqlite` becomes
`unavailable`, `not_operator` becomes `forbidden`, `not_configured` becomes `empty` with a sentence
specific to whichever report was asked for, and anything else is `error`. The distinction is the
operator's next move: a SQLite deployment needs `DATABASE_URL` set on the API, a refused account
needs an operator grant, an unconfigured report needs a setting, and only `error` is worth retrying.
Collapsing all four into "something went wrong" would send them to the same place for four
different problems.

A state the screen recognises but the deployment shares everywhere collapses to one screen rather than one card per report: all four unavailable, all four forbidden, or all four failing with the same sentence. Each of those is a fact about the deployment, the account or the connection rather than about any one report, so repeating it six times (four tiles, the digest, the table) is one fact shouted down the page. The first two are answers the API gave correctly and are drawn as states; the third is a fault and is announced as one, with the single retry every card would have offered. The collapse for failures requires an identical sentence from all four: four different failures are four different things to fix, and one sentence would hide three of them. This was not in the first draft, which rendered an unreachable API as six identical alert panels; the state sweep caught it.

**The client component names its types, never its values.** `src/server/dashboard/overview.ts` is
`server-only`, so the browser-side component imports from it with `import type` only. Type imports
are erased before the bundler sees them, which is what lets both sides agree on one shape without
the server module reaching the bundle. The first draft of the component imported `factorNamed`, a
value, from the server-only `admin.ts`; that would have failed the build, and the function was
removed rather than duplicated, since the client finds its factor by name in the array it already
has.

---

## D19. The Users table shows the fields the API sends, and searches the way the API searches

**Date:** 2026-10-06
**Status:** accepted

Two of the prototype's Users screen behaviours have no source in the API, and one of them has a
source that behaves differently from what the prototype implies. Both are answered by changing the
screen rather than by inventing the data.

**The table is the API's fields, not the prototype's.** The prototype's table has columns for
Provider, MFA and Last seen. `GET /v1/admin/users` returns `id`, `email`, `created_at`, `updated_at`,
`failed_attempts`, `locked` and `locked_until`, and none of those three is in it or derivable from
it. The screen shows Account, Created, Last change, Failed attempts and Status instead. The
alternative, kept in the first draft, was to render the three missing columns empty or with a dash,
which is the failure mode the dashboard already rejected (BACKEND_GAPS 2.13): a blank cell under
"Provider" reads as an account with no provider rather than as a console that cannot know. An
account's second factor is visible where the API does publish it, on the dashboard's MFA adoption
report, which is a count rather than this table's row.

The same rule is why the drawer's "Active sessions" line is a count and not a list: the detail
endpoint answers `active_sessions` as a number, so the screen can say four sessions are live and
cannot say from where. A list here would have to come from `GET /v1/sessions` for the operator's own
account, which is a different account's data and not this endpoint's to give.

**Search is one exact address, so the screen says one exact address.** `GET /v1/admin/users` takes
`email` as an exact, case-sensitive match; there is no partial match and no other field is
searchable. The prototype's search box implies a substring search over several fields. Three
options: search on the server with an exact match and label the result, add a console-side filter
over a fetched page, or ask the API for a `q` parameter. The second is wrong rather than merely
limited, because it would filter one page of twenty-five while the count and the pager below it
described the whole table. The third is a new API feature, and the exactness is deliberate on the
engine's side: `operator.Store` looks accounts up by primary key or by exact email, so a substring
search would be a new query shape and a new index rather than a parameter. The screen therefore
searches exactly, and says so: the pager prints `describeMatch`, which turns the API's own `match`
field into the sentence "The API matched one exact address." rather than leaving the operator to
infer the mode from an empty table. A miss is worded as a working search that found nothing
(`EXACT_EMAIL_MISS_DETAIL`), never as the sentence for an account the API has lost, because the two
are the same empty table and completely different problems.

---

## D20. Overlays render into the document body, through one component

**Date:** 2026-10-06
**Status:** accepted

`Modal` and `Drawer` render their overlay through `OverlayPortal`, which is a `createPortal` into
`document.body`. The drawer is what found the need: opened from a row of the Users table, its panel
was 423 px tall instead of full height, ending at the bottom of the card it was opened from.

The cause is not stacking and not z-index. `position: fixed` is resolved against the nearest ancestor
that establishes a containing block, and an ancestor with a `transform`, a `filter` or a
`will-change` does. Every console screen is wrapped in `.view.anim`, whose `fadeUp` animation fills
its final keyframe: `animation: fadeUp 0.35s ease both` leaves the element with a `translateY(0)`
that `getComputedStyle` reports as `matrix(1, 0, 0, 1, 0, 0)`. The identity matrix is still a
matrix, so the `fixed` overlay was laid out against the 1180 px content column and the height of the
row it sat in. Verified by probing the element, not by reading the CSS: the overlay measured
1180x423.25 against a 1440x1000 window, and 1440x1000 after the portal.

The one-line alternative was to drop the animation's fill mode, or to remove `translateY` from the
keyframe. That fixes today's cause and leaves the next one: any wrapper that adds a transform, a
`filter` for a backdrop blur, or a `will-change` for a scroll animation reintroduces the bug, and it
reappears on whichever screen added it rather than at the component that is actually wrong. A portal
takes the overlay out from under all of them at once, which is why it is one shared component rather
than a rule each screen has to remember.

Two consequences are load-bearing. `OverlayPortal` reads `document` synchronously and renders
nothing on the server, so an overlay must not be open in the first paint; neither can be, since both
take `open`, start closed and are opened by a click. And the portal target is read during render
rather than held in state from an effect: a target that arrives one render late means the focus
trap's lifecycle effect runs with a null container, focuses nothing, and never runs again, because
its dependency array has not changed. The first draft of this component used
`useState`/`useEffect` and focus never entered the panel. `tests/unit/users-view.test.tsx` holds
focus-in and the focus return on close, so that failure cannot come back quietly.
