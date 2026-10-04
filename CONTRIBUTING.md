# Contributing to csax+

Thanks for taking a look. This file is short on ceremony and specific about the parts that are not
negotiable, because the project's own rules are enforced by tooling and it is kinder to tell you
about them here than to let a hook do it.

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

For anything larger than a typo, **open an issue first**. Not as a formality: the console's screens
are tied to endpoints that may or may not exist in the API, and the answer often changes the shape
of the work. A quick issue saves you writing a screen against an endpoint nobody has.

Good first contributions, in rough order of how self-contained they are:

1. A docs fix, especially where this repository claims something the code does not do.
2. A screen whose endpoint already exists and which no tier has built yet. The feature table in the
   [README](README.md#3-feature-status) says which those are.
3. One of the missing API endpoints in
   [docs/build/BACKEND_GAPS.md](docs/build/BACKEND_GAPS.md), in the `api` repository.

## Getting set up

```bash
pnpm install
cp .env.example .env.local     # fill in two 32-byte base64 keys
pnpm dev
```

Node 22 or newer. `openssl rand -base64 32` generates each key. Never commit `.env.local`; the
`.gitignore` covers it, and so does the pre-commit review below.

## The gate

Every pull request has to pass this, and it is the same command the maintainers run:

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Anything touching the UI or authentication also runs `pnpm test:e2e`. That suite starts its own dev
server if one is not already listening.

Do not skip a hook with `--no-verify`. If a hook is wrong, fix the hook in the same change and say
so in the pull request.

## House rules

These are the project's ground rules. Most are enforced by tooling, which is why a violation shows
up as a failing test rather than a review comment.

**The look is specified.** `styles.css` in the repository root is the design source: one global
token stylesheet, no Tailwind and no CSS Modules. Reuse the existing class names and tokens rather
than introducing a second way to do the same thing. If a screen needs a new token, say why in the
pull request.

**No em dashes or en dashes anywhere.** Not in code, comments, UI copy, docs, configuration, tests
or commit messages. Use a comma, a colon, parentheses, or a full stop. `tests/unit/no-forbidden-characters.test.ts`
fails the build over one, and the commit hook rejects it in a message.

**No secrets, addresses or sample users in real code.** Placeholders only, of the `<like-this>`
kind. Sample data belongs in the fixtures adapter or in a test, and the sample users there use a
reserved domain such as `example.test` so they cannot be mistaken for a real deployment's.

**Never commit** a `.env` file other than `.env.example`, a key file, a SQLite file, or anything
under `secrets/`. The `.gitignore` covers all of it; check `git status` before you stage.

**No telemetry, ever.** No analytics SDK, no crash reporter, no external font at runtime, nothing
that phones home. Fonts are self-hosted through `next/font`. The landing page's e2e test fails if
any request leaves the deployment's own origin, so this one cannot slip in unnoticed.

**Honesty over completeness.** This is the rule that produces most of the review comments, so it is
worth stating plainly:

- Do not fake a backend. If the API cannot answer, say so on the screen and add the gap to
  `docs/build/BACKEND_GAPS.md` with the file and line that proves it.
- Do not show a number the console has not read. A zeroed stat card is a claim.
- Do not claim something works because it typechecks. Run it, and if you cannot run it, say that in
  the pull request and list the manual steps.
- Prefer saying less to saying something you cannot support.

## Style

Match the code around you, and read a file before you change it. Beyond that:

- TypeScript strict, no `any`. Prefer many small files over one large one, and short typed
  functions.
- Server code goes in `src/server/`, and anything that must never reach a browser client imports
  `server-only`.
- Route handlers take a `Request` and return a `Response`, with cookies read from and written to the
  raw headers. That is what makes them testable without mocks; do not reach for `next/headers`
  inside one.
- Comments explain why, not what. The existing comments say what a thing is for, what it is
  deliberately not doing, and what would go wrong otherwise. Match that.
- Prettier decides formatting and ESLint decides the rest. Run `pnpm format` before you push.

## Tests

- Unit tests with vitest in `tests/unit/`, e2e with Playwright in `tests/e2e/`.
- Write the e2e test with the screen, not after it. A screen with only a success state has not been
  finished: give it loading, empty and error states, and test them.
- Check keyboard navigation, focus-visible, and a 375 pixel viewport for anything you touch. The e2e
  suite has an iframe harness for the narrow case, because headless Chrome clamps the window and a
  screenshot of a clamped window looks like a layout bug that is not there.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/). A `commit-msg` hook enforces the
format, a subject of at most 72 characters, and the absence of a `Co-authored-by:` trailer or any
tool attribution. Write the body for the person reading `git log` in a year: what changed and why,
not a restatement of the diff.

## Pull requests

Small and focused. One screen or one fix per pull request. In the description:

- what changed, and what the reviewer should look at first;
- what you ran, with the actual result;
- anything you could not run, and the manual steps to check it;
- any claim on a screen that you are not certain about, because that is the thing most worth a
  second pair of eyes.

A pull request that adds a screen the API cannot serve yet will be sent back to the issue tracker.
That is not a judgement on the work; it is the project refusing to ship a screen that lies.
