# Decisions

Choices made while building, and why. Section 1 of BUILD_NOTE.md requires any departure from the
suggested stack to be written here before it is made, rather than switched silently.

---

## D1. Styling: CSS custom properties plus CSS Modules, not Tailwind utilities

**Date:** 2026-10-04
**Status:** accepted

BUILD_NOTE.md section 1 allows "Tailwind v4 (or CSS Modules)" and requires the token names to be
kept. We take the CSS Modules option.

Reasons:

1. The prototype's `styles.css` is 783 lines of hand-tuned CSS. Porting it to utility classes would
   rewrite every screen's markup and risk drifting from the visuals the brief says to keep.
2. The token names (`--violet`, `--surface`, `--border-soft` and the rest) are already a complete
   design system. They move into `globals.css` unchanged and every component reads them.
3. CSS Modules give component-scoped class names without a build-time utility layer, which keeps
   the output small and the CSP simple (no inline style attributes, no runtime CSS-in-JS).

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
