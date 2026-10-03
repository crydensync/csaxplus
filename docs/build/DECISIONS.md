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
