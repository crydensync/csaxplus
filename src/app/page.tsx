import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";

import { IconShieldCheck, IconSparkle } from "@/components/icons";
import {
  IconArrowRight,
  IconCode,
  IconGlobeOff,
  IconServer,
  IconShield,
  IconStack,
  IconTelemetry,
  IconUser,
  type IconProps,
} from "@/components/landing-icons";
import { NAV_GROUPS } from "@/lib/nav";

/**
 * The landing page, ported from the prototype's `landing.html`.
 *
 * Server-rendered and static: it reads no cookie and calls no API, so a signed
 * out visitor and a signed in operator both get the same bytes. The one action
 * on it, "Open console", points at `/dashboard`, which is where the console
 * decides between the dashboard and the sign-in screen.
 *
 * Every factual claim on this page is checkable against the two Go repos in
 * `docs/build/BACKEND_GAPS.md`: the engine and the API were read to confirm
 * each number, name and behaviour. Claims the prototype made that the code
 * does not support were changed rather than copied, and each one is noted in
 * that file's section 2.
 */

/**
 * No `og:image`, and that is deliberate rather than an omission.
 *
 * A relative image is resolved against `metadataBase`, which has to be an
 * absolute origin. The only origin this deployment knows for certain is
 * `WEBAUTHN_ORIGIN`, which is boot-validated rather than available at build
 * time, so a container built without runtime secrets would publish an image
 * URL pointing at `localhost`. Announcing the wrong host is worse than
 * announcing none, so the prototype's `og-image.png` waits for the tier 5
 * deployment work, where the console's own public origin becomes a setting
 * (BUILD_NOTE step 5.5, DECISIONS D14).
 */
export const metadata: Metadata = {
  title: "csax+, the CrydenSync console",
  description:
    "csax+ is the console for CrydenSync, the embeddable authentication engine you run yourself. Your users, sessions and audit logs stay in your own database.",
  openGraph: {
    type: "website",
    title: "csax+, the CrydenSync console",
    description: "Self-hosted authentication you drive from a UI instead of the CLI.",
  },
  twitter: { card: "summary" },
  icons: { icon: "/cryden-icon.png" },
};

const CONSOLE_HREF = "/dashboard";
const ENGINE_URL = "https://github.com/crydensync/cryden";
const API_URL = "https://github.com/crydensync/api";
const GO_REFERENCE_URL = "https://pkg.go.dev/github.com/crydensync/cryden/v2";

/** Counted from the real navigation, so the heading cannot drift from it. */
const SCREEN_COUNT = NAV_GROUPS.reduce((total, group) => total + group.items.length, 0);

const SECTIONS = [
  { href: "#own", label: "Why" },
  { href: "#auth", label: "Auth" },
  { href: "#security", label: "Security" },
  { href: "#ai", label: "AI admin" },
  { href: "#backends", label: "Backends" },
  { href: "#console", label: "Console" },
] as const;

/** One card in a `.lp-grid`, with an optional icon above the heading. */
function FeatureCard({
  title,
  body,
  icon: Icon,
}: {
  title: string;
  body: ReactNode;
  icon?: ComponentType<IconProps>;
}) {
  return (
    <div className="card lp-card">
      {Icon === undefined ? null : (
        <div className="lp-icon">
          <Icon />
        </div>
      )}
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

/**
 * The console mock in the hero. It is a picture of the product, not a reading
 * from one: nothing here comes from an API, so the whole block is hidden from
 * assistive technology and the title bar says the numbers are an example. No
 * console screen may ever do this, which is why the mock lives on the
 * marketing page and nowhere else.
 */
function ConsoleMock() {
  return (
    <div className="lp-hero-art" aria-hidden="true">
      <div className="lp-window">
        <div className="lp-window-bar">
          <span className="lp-dot" />
          <span className="lp-dot" />
          <span className="lp-dot" />
          <span className="lp-window-title">csax+ console · example data</span>
        </div>
        <div className="lp-window-body">
          <div className="lp-mock-digest">
            <IconSparkle />
            <p>
              <strong>14</strong> new signups, <strong>3</strong> lockouts (all self-resolved),{" "}
              <strong>1</strong> anomaly reviewed. Nothing needs your attention.
            </p>
          </div>
          <div className="lp-mock-stats">
            <div>
              <span>Users</span>
              <b>2,481</b>
            </div>
            <div>
              <span>Sessions</span>
              <b>312</b>
            </div>
            <div>
              <span>MFA</span>
              <b>41%</b>
            </div>
            <div>
              <span>Flagged</span>
              <b className="lp-amber">1</b>
            </div>
          </div>
          <div className="lp-mock-rows">
            <div className="audit-row">
              <span className="audit-dot ok" />
              <span className="audit-time">14:02</span>
              <span className="audit-event">session_revoked</span>
            </div>
            <div className="audit-row">
              <span className="audit-dot bad" />
              <span className="audit-time">11:47</span>
              <span className="audit-event">login_failed x 3</span>
            </div>
            <div className="audit-row">
              <span className="audit-dot ok" />
              <span className="audit-time">09:15</span>
              <span className="audit-event">oauth_linked</span>
            </div>
          </div>
        </div>
      </div>
      <div className="lp-hero-glow" />
    </div>
  );
}

export default function LandingPage() {
  return (
    <>
      <a className="lp-skip" href="#main">
        Skip to content
      </a>

      <header className="lp-nav">
        <div className="lp-wrap lp-nav-inner">
          <Link className="lp-brand" href="/">
            <span className="brand-mark">
              <Image src="/cryden-icon.png" alt="" width={30} height={30} priority />
            </span>
            <span className="brand-text">
              <b>csax+</b>
              <span>CRYDENSYNC CONSOLE</span>
            </span>
          </Link>
          <nav className="lp-nav-links" aria-label="Page sections">
            {SECTIONS.map((section) => (
              <a key={section.href} href={section.href}>
                {section.label}
              </a>
            ))}
          </nav>
          <Link className="btn primary lp-nav-cta" href={CONSOLE_HREF}>
            Open console
          </Link>
        </div>
      </header>

      {/* `tabIndex={-1}` is what makes the skip link land: without it a browser
          moves the scroll position but leaves focus in the nav, so the next Tab
          returns to the top of the page. */}
      <main id="main" tabIndex={-1}>
        <section className="lp-hero">
          <div className="lp-wrap lp-hero-inner">
            <div>
              <span className="lp-badge">
                <i aria-hidden="true" />
                self-hosted · MIT · Go 1.25+
              </span>
              <h1 className="lp-h1">
                Scaling Trust
                <br />
                for digital age.
              </h1>
              <p className="lp-lede">
                <strong>csax+</strong> is the console for <strong>CrydenSync</strong>, an
                embeddable, framework-agnostic authentication engine for Go. Import it, configure
                it, own your users. Drive the whole deployment from a UI instead of the CLI.
              </p>
              <div className="lp-cta-row">
                <Link className="btn primary lp-btn-lg" href={CONSOLE_HREF}>
                  Open console
                  <IconArrowRight />
                </Link>
                <a className="btn lp-btn-lg" href="#console">
                  See what&apos;s inside
                </a>
              </div>
              <ul className="lp-trust">
                <li>
                  <IconShield />
                  Secure
                </li>
                <li>
                  <IconServer />
                  Self-hosted
                </li>
                <li>
                  <IconCode />
                  Open source
                </li>
                <li>
                  <IconGlobeOff />
                  No vendor lock-in
                </li>
              </ul>
            </div>
            <ConsoleMock />
          </div>
        </section>

        <section className="lp-section" id="own">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <span className="lp-eyebrow">Why</span>
              <h2 className="lp-h2">Auth you run, not auth you rent.</h2>
              <p className="lp-sub">
                Every project ends up rewriting auth from scratch, or handing user data to a
                third-party provider. CrydenSync is a library, not a service.
              </p>
            </div>
            <div className="lp-grid cols-3">
              <FeatureCard
                icon={IconUser}
                title="Own your users"
                body="No hosted service, no data leaving your infrastructure. Users, sessions and audit logs stay in your own database, under your own control."
              />
              <FeatureCard
                icon={IconStack}
                title="No vendor lock-in"
                body="Plain Postgres tables, or one SQLite file. No proprietary format, no export migration, nobody's egress bill."
              />
              <FeatureCard
                icon={IconTelemetry}
                title="Zero telemetry"
                body={
                  <>
                    The engine never phones home. Logs and audit events go wherever <em>you</em>{" "}
                    wire them, never to us.
                  </>
                }
              />
            </div>
            <p className="lp-note">
              Nothing here acts on its own initiative. Breach checking, IP geolocation and log
              shipping are interfaces the engine ships with <strong>no implementation</strong>: wire
              one, or leave it off and nothing else changes. Webhook delivery is the API&apos;s own
              sender, and it posts only the events you subscribed it to.
            </p>
          </div>
        </section>

        <section className="lp-section lp-alt" id="auth">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <span className="lp-eyebrow">Auth</span>
              <h2 className="lp-h2">The whole auth surface, not a login form.</h2>
              <p className="lp-sub">
                Every capability below is a first-class part of the engine, not a plugin, not an
                add-on module, not a per-seat upgrade.
              </p>
            </div>
            <div className="lp-grid cols-3">
              <FeatureCard
                title="Passwords & sessions"
                body="Signup, login, and logout on a single device or all of them. JWT access tokens with rotating opaque refresh tokens and theft/reuse detection."
              />
              <FeatureCard
                title="OAuth, any provider"
                body={
                  <>
                    The engine treats a provider as an opaque string, so a deployment configures
                    whichever it needs. An email collision returns a conflict rather than silently
                    linking: auto-linking on an email match alone is an account-takeover vector.
                  </>
                }
              />
              <FeatureCard
                title="Two-factor, unified"
                body={
                  <>
                    TOTP and passkeys (WebAuthn) under one pause state. An account can have either,
                    both, or neither, and <span className="mono">Login</span> reports whichever are
                    enrolled.
                  </>
                }
              />
              <FeatureCard
                title="Magic links"
                body="Passwordless login for existing accounts. The link proves email ownership, the primary factor, so it routes through the same second-factor gate a password does."
              />
              <FeatureCard
                title="Recovery codes"
                body="A fallback for an account that already has a real second factor. If that factor is removed while codes remain, they stop being offered rather than becoming a standing backdoor."
              />
              <FeatureCard
                title="Email verification & change"
                body="Token issue and confirm as engine primitives. Delivery is pluggable: the engine hands you a raw token and never assumes your domain or routes."
              />
              <FeatureCard
                title="Password policy"
                body={
                  <>
                    Eight to seventy-two characters by default, with the composition rules off. A
                    violation returns <em>every</em> broken rule at once, as stable codes, so a
                    client can show them together.
                  </>
                }
              />
              <FeatureCard
                title="Extensible JWT claims"
                body="Attach roles, tenant IDs, plan, whatever your authorization layer needs, to every access token. The seven registered claim names are refused all-or-nothing."
              />
              <FeatureCard
                title="API keys"
                body={
                  <>
                    <span className="mono">ck_</span>-prefixed machine credentials for CI and cron,
                    deliberately outside the second-factor system. Only the hash is stored, and
                    every read failure looks identical.
                  </>
                }
              />
            </div>
          </div>
        </section>

        <section className="lp-section" id="security">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <span className="lp-eyebrow">Security</span>
              <h2 className="lp-h2">Signals, not surprise lockouts.</h2>
              <p className="lp-sub">
                Detection here records what looks wrong and lets a human decide. No login is ever
                blocked, delayed or challenged by an anomaly, and none of it returns an error a
                client could branch on.
              </p>
            </div>
            <div className="lp-grid cols-2">
              <FeatureCard
                title="Anomaly detection"
                body={
                  <>
                    Six signal codes over login attempts: new IP, new device, per-user and per-IP
                    failure velocity, refresh-token reuse, and an unusual count of concurrent
                    sessions. Report-only, always.
                    <span className="lp-chips">
                      <span className="mono">new_ip</span>
                      <span className="mono">new_device</span>
                      <span className="mono">token_reuse</span>
                      <span className="mono">concurrent_sessions</span>
                    </span>
                  </>
                }
              />
              <FeatureCard
                title="Credential-stuffing detection"
                body={
                  <>
                    One IP spraying one leaked password across many accounts: the attack per-account
                    lockout structurally cannot see, because each account only ever witnesses a
                    single failure.
                    <span className="lp-chips">
                      <span className="mono">account_spray</span>
                      <span className="mono">unknown_account_spray</span>
                    </span>
                  </>
                }
              />
              <FeatureCard
                title="Lockout that survives a restart"
                body="Persistent and database-backed, so it holds through restarts and stays correct across multiple running instances. Five attempts, fifteen minutes, both configurable."
              />
              <FeatureCard
                title="Rate limiting, two layers"
                body="Per-user windows on login, signup and magic-link, plus a coarser per-IP edge guard. In-memory for a single instance; point it at Redis and every replica counts against one shared window."
              />
              <FeatureCard
                title="bcrypt or Argon2id"
                body="Two real implementations of one interface. Every hash names its own algorithm, so a table can hold both mid-migration, and out-of-date hashes upgrade themselves on the next successful login."
              />
              <FeatureCard
                title="Named sessions"
                body={
                  <>
                    <span className="mono">Chrome on macOS</span> instead of a UUID, computed on
                    read from the IP and User-Agent every session already stores. No migration, no
                    new column, and with no geolocator wired the label is device-only.
                  </>
                }
              />
            </div>
          </div>
        </section>

        <section className="lp-section lp-alt" id="ai">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <span className="lp-eyebrow">AI admin</span>
              <h2 className="lp-h2">Four assistants. None of them can act.</h2>
              <p className="lp-sub">
                All four read the engine&apos;s own audit history and current settings. There is no
                code path in any of them that locks an account, changes a config value, or takes any
                action at all.
              </p>
            </div>
            <div className="lp-grid cols-4">
              <FeatureCard
                title="Weekly digest"
                body="A plain-English summary of the week. A quiet week renders as two lines."
              />
              <FeatureCard
                title="Support assistant"
                body="Why a given account cannot sign in, answered from lock state, recent failures and session state, never guessed at."
              />
              <FeatureCard
                title="Config advisor"
                body="Reads 30 days of history against the settings actually in force and suggests changes. A suggestion pre-fills a field; a human still saves it."
              />
              <FeatureCard
                title="Ask-AI widget"
                body="The one piece your own end users can embed, answering questions about their own account."
              />
            </div>

            <div className="lp-callout">
              <div className="lp-callout-icon">
                <IconShieldCheck />
              </div>
              <div>
                <b>
                  A prompt injection can change what query the model tries. It cannot change what
                  the code lets that query read.
                </b>
                <p>
                  The widget discards whatever identity filter the model produced and substitutes
                  the id verified from the caller&apos;s own token, unconditionally, rather than
                  validating and rejecting. Every phrasing of a question, honest or adversarial,
                  produces the exact same scoped query, so there is no error oracle to learn from
                  either.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-section" id="backends">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <span className="lp-eyebrow">Backends</span>
              <h2 className="lp-h2">Postgres, or a single file.</h2>
              <p className="lp-sub">
                Two real backends behind one set of interfaces, not a production path and a toy.
                Exactly one environment variable chooses between them, and setting both is a startup
                error rather than a silent preference.
              </p>
            </div>

            <div className="lp-backends">
              <div className="card lp-backend">
                <div className="lp-backend-head">
                  <h3>Postgres</h3>
                  <span className="pill green">everything</span>
                </div>
                <p className="lp-backend-note">
                  Postgres 13+ (local, Docker, or hosted: Supabase, Neon, RDS).
                </p>
                <ul className="lp-list">
                  <li>The complete auth surface</li>
                  <li>The full admin console: users, metadata, webhooks, logs, digest</li>
                  <li>Support diagnosis, config tuning, anomaly review</li>
                  <li>
                    AI provider settings, encrypted at rest once{" "}
                    <span className="mono">SETTINGS_ENCRYPTION_KEY</span> is set
                  </li>
                </ul>
              </div>
              <div className="card lp-backend">
                <div className="lp-backend-head">
                  <h3>SQLite</h3>
                  <span className="pill neutral">core auth only</span>
                </div>
                <p className="lp-backend-note">
                  One writable path and a volume. No database server to run at all.
                </p>
                <ul className="lp-list">
                  <li>Signup, login, refresh, sessions, password change</li>
                  <li>Email change, OAuth, TOTP, passkeys, recovery codes</li>
                  <li>Magic links and API keys</li>
                  <li>
                    Everything under <span className="mono">/v1/admin</span> answers{" "}
                    <span className="mono">501</span>: the console&apos;s tables are Postgres-only
                  </li>
                </ul>
              </div>
            </div>

            <p className="lp-note">
              Migrations are compiled into the binary and applied on boot, so a{" "}
              <span className="mono">git pull</span> or a new container image brings its own schema
              change with it. Teams who would rather review schema changes set{" "}
              <span className="mono">SKIP_AUTO_MIGRATE</span> and run{" "}
              <span className="mono">api migrate</span> in the pipeline instead.
            </p>
          </div>
        </section>

        <section className="lp-section lp-alt" id="console">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <span className="lp-eyebrow">The console</span>
              <h2 className="lp-h2">{SCREEN_COUNT} screens over the CLI.</h2>
              <p className="lp-sub">
                The console&apos;s own navigation, group for group. Screens marked read-only are the
                AI surface: the assistant there reads and explains, and holds no reference to
                anything that writes.
              </p>
            </div>

            <div className="lp-console-grid">
              {NAV_GROUPS.map((group) => {
                // The group label is a label, not a heading, so the list points
                // at it explicitly rather than being announced unlabelled.
                const labelId = `console-group-${group.label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
                return (
                  <div className="lp-console-group" key={group.label}>
                    <span className="lp-console-label" id={labelId}>
                      {group.label}
                    </span>
                    <ul className="lp-list lp-list-tight" aria-labelledby={labelId}>
                      {group.items.map((item) => (
                        <li key={item.href}>
                          {item.label}
                          {item.readOnly === true ? <em className="tier-tag">read-only</em> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>

            <div className="lp-cli">
              <span className="lp-console-label lp-console-label-sp">
                What the console replaces
              </span>
              <code>
                {'go run ./cmd/grant-operator -db "$DATABASE_URL" -email "$OPERATOR_EMAIL"'}
              </code>
              <code>api migrate --baseline</code>
            </div>

            <p className="lp-note">
              Writes on the admin surface are few and deliberate: operator metadata (which becomes
              JWT claims), a review note on a flagged event, and a settings save. Nothing else. No
              AI feature can reach any of them: no tool holds a reference, and the engine&apos;s
              interfaces carry no method that could call one.
            </p>
          </div>
        </section>

        <section className="lp-cta-band">
          <div className="lp-wrap lp-cta-inner">
            <span className="brand-mark lp-cta-mark">
              <Image src="/cryden-icon.png" alt="" width={60} height={60} />
            </span>
            <h2 className="lp-h2">Your deployment is already running.</h2>
            <p className="lp-sub">Open the console and take a look around.</p>
            <div className="lp-cta-row lp-cta-row-center">
              <Link className="btn primary lp-btn-lg" href={CONSOLE_HREF}>
                Open console
                <IconArrowRight />
              </Link>
              <a className="btn lp-btn-lg" href={ENGINE_URL}>
                Read the docs
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-inner">
          <div className="lp-footer-brand">
            <span className="brand-mark">
              <Image src="/cryden-icon.png" alt="" width={28} height={28} />
            </span>
            <span className="brand-text">
              <b>csax+</b>
              <span>CRYDENSYNC CONSOLE</span>
            </span>
          </div>
          <nav className="lp-footer-links" aria-label="Project links">
            <a href={ENGINE_URL}>Engine</a>
            <a href={API_URL}>HTTP API</a>
            <a href={GO_REFERENCE_URL}>Go reference</a>
          </nav>
          <p className="lp-footer-note">
            MIT licensed. Built in Africa with{" "}
            <span className="lp-heart" aria-hidden="true">
              ♥
            </span>
            . Own your users, not vendor lock-in.
          </p>
        </div>
      </footer>
    </>
  );
}
