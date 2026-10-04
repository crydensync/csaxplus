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
each dialect onto one neutral description and `tests/unit/db-schema.test.ts`
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

**What is verified, and what is not.** The SQLite path is run for real: the
migrations, the driver, the typed handle and the boot check all execute in the
test suite and against the built server. Postgres is not run. There is no
Postgres server in this environment and no Docker daemon to start one, so its
migrations and queries are typed and structurally compared, never executed.
Adding `@electric-sql/pglite` as a development dependency would run the Postgres
dialect in-process, and is left for a decision at the end of the tier rather
than taken silently.

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

