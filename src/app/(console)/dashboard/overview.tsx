"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/Button";
import { Card, StatCard } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { IconRefresh, IconSparkle } from "@/components/icons";
import { Pill } from "@/components/Pill";
import { EmptyState, ErrorState, LoadingAnnouncement, Skeleton } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import {
  formatCount,
  formatInstant,
  describeWindow,
  NOT_OPERATOR_DETAIL,
  SQLITE_ADMIN_DETAIL,
} from "@/lib/dashboard";
// Types only, and deliberately so: `overview.ts` is server-only, and a value
// import from it here would fail the build. A type import is erased before the
// bundler sees it, which is what lets the browser and the route that feeds it
// agree on one shape instead of two that drift.
import type {
  AccountsSection,
  AdminUser,
  DashboardOverview,
  DigestRun,
  MfaAdoption,
  Section,
} from "@/server/dashboard/overview";

/**
 * The dashboard's data, rendered.
 *
 * A client component because the read goes through the console's own route
 * handler: that is where the API tokens get renewed, and a server component
 * cannot write the cookie a renewal needs. See the route for the full reason.
 *
 * Every section of the answer carries its own state, and each is rendered where
 * it sits rather than collapsing the screen on the first failure. A deployment
 * whose digest is unconfigured still has accounts, second factors and a hasher
 * to report, and a screen that went blank would hide three answers that arrived.
 */

type Load =
  | { kind: "loading" }
  | { kind: "failed"; failure: ConsoleFailure }
  | { kind: "ok"; overview: DashboardOverview };

/** The console's own route could not be reached, so nothing was attempted. */
const CONSOLE_UNREACHABLE: ConsoleFailure = {
  message: "The console could not reach its own server. Check your connection and try again.",
  code: "console_unreachable",
};

/** The route answered with something this screen cannot read. */
const CONSOLE_MALFORMED: ConsoleFailure = {
  message: "The console answered the dashboard with a shape this screen does not recognise.",
  code: "console_malformed",
};

export function DashboardOverview() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const inFlight = useRef<AbortController | null>(null);

  const read = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    let response: Response;
    try {
      response = await fetch("/api/console/dashboard", {
        credentials: "same-origin",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) return;
      setLoad({ kind: "failed", failure: CONSOLE_UNREACHABLE });
      return;
    }

    const payload: unknown = await response.json().catch(() => null);
    if (controller.signal.aborted) return;

    if (!response.ok) {
      setLoad({ kind: "failed", failure: failureFrom(payload, response.status) });
      return;
    }

    const overview = dataFrom<DashboardOverview>(payload);
    if (overview === null) {
      setLoad({ kind: "failed", failure: CONSOLE_MALFORMED });
      return;
    }

    setLoad({ kind: "ok", overview });
  }, []);

  useEffect(() => {
    void read();
    return () => inFlight.current?.abort();
  }, [read]);

  const retry = useCallback(() => {
    setLoad({ kind: "loading" });
    void read();
  }, [read]);

  if (load.kind === "loading") return <LoadingDashboard />;

  if (load.kind === "failed") {
    return (
      <div className="view anim">
        <ErrorState
          title="The dashboard did not load"
          description={load.failure.message}
          code={load.failure.code ?? undefined}
          onRetry={retry}
        />
      </div>
    );
  }

  const { overview } = load;

  // One sentence instead of four or six. When every section came back the same
  // way, that answer is about the deployment, the account or the connection
  // rather than about any one report, and repeating it in every card would bury
  // the one thing the operator needs to read.
  const shared = sharedState(overview);
  if (shared !== null) {
    return (
      <div className="view anim">
        {shared.fault ? (
          <ErrorState title={shared.title} description={shared.detail} onRetry={retry} />
        ) : (
          <EmptyState
            title={shared.title}
            description={shared.detail}
            action={
              <Button onClick={retry}>
                <IconRefresh />
                Try again
              </Button>
            }
          />
        )}
      </div>
    );
  }

  return (
    <div className="view anim">
      <DigestCard section={overview.digest} onRetry={retry} />

      <div className="section-title">Overview</div>
      <div className="grid cols-4">
        <StatSection
          label="Total users"
          section={overview.accounts}
          onRetry={retry}
          render={(accounts) => ({
            value: formatCount(accounts.total),
            delta: "every account the API counts",
          })}
        />
        <FactorSection
          label="Authenticator apps"
          factor="totp"
          section={overview.factors}
          onRetry={retry}
        />
        <FactorSection
          label="Passkeys"
          factor="passkey"
          section={overview.factors}
          onRetry={retry}
        />
        <StatSection
          label="Password hashes"
          section={overview.hashes}
          onRetry={retry}
          render={(hashes) => ({
            value: hashes.hasher.algorithm,
            delta: `${formatCount(hashes.estimated_remaining)} of ${formatCount(
              hashes.total_users,
            )} accounts not recorded as upgraded`,
            tone: hashes.estimated_remaining > 0 ? "warn" : "up",
          })}
        />
      </div>

      <div className="section-title">Newest accounts</div>
      <NewestAccounts section={overview.accounts} onRetry={retry} />
    </div>
  );
}

/**
 * The whole-screen answer, when every section shares one.
 *
 * Three cases qualify, and each is a fact about the deployment, the account or
 * the connection rather than about a single report, so each gets one screen
 * instead of four cards: an API on SQLite, where no admin route exists at all; an
 * account the API does not recognise as an operator; and a connection that failed
 * the same way for every report, which is what an unreachable API looks like.
 *
 * `fault` decides how it is announced. The first two were answered correctly and
 * are not faults; the third is, and gets the alert and the live region that go
 * with one.
 *
 * The error case requires an identical detail from all four. Four different
 * failures are four different things to fix, and folding them into one sentence
 * would hide three of them.
 */
function sharedState(
  overview: DashboardOverview,
): { title: string; detail: string; fault: boolean } | null {
  const sections = [overview.accounts, overview.factors, overview.hashes, overview.digest];

  if (sections.every((section) => section.state === "unavailable")) {
    return {
      title: "This deployment has no admin surface",
      detail: SQLITE_ADMIN_DETAIL,
      fault: false,
    };
  }
  if (sections.every((section) => section.state === "forbidden")) {
    return {
      title: "This account is not a console operator",
      detail: NOT_OPERATOR_DETAIL,
      fault: false,
    };
  }

  const errors = sections.filter((section) => section.state === "error");
  if (errors.length === sections.length) {
    const [first, ...rest] = errors;
    if (first !== undefined && rest.every((section) => section.detail === first.detail)) {
      return { title: "The dashboard's reports did not load", detail: first.detail, fault: true };
    }
  }

  return null;
}

/** A title for a section that answered without data, chosen by why. */
function stateTitle(state: "unavailable" | "forbidden" | "empty"): string {
  if (state === "unavailable") return "Not available on this deployment";
  if (state === "forbidden") return "Refused by the API";
  return "Nothing to report";
}

/**
 * The body of a section that did not answer with data.
 *
 * `error` is the only state that is a fault, so it is the only one that gets an
 * alert and a retry. A refusal or an unconfigured report was answered correctly,
 * and announcing those as something going wrong would be the console's mistake
 * rather than the deployment's.
 */
function SectionState({
  section,
  onRetry,
}: {
  section: Exclude<Section<unknown>, { state: "ok" }>;
  onRetry: () => void;
}) {
  if (section.state === "error") {
    return (
      <ErrorState
        bare
        description={section.detail}
        code={section.code ?? undefined}
        onRetry={onRetry}
      />
    );
  }
  return <EmptyState bare title={stateTitle(section.state)} description={section.detail} />;
}

/**
 * One stat tile, in whatever state its section came back in.
 *
 * A section that could not answer keeps its tile and says so there rather than
 * disappearing: three tiles and a gap reads as a layout bug, and the operator
 * would have no idea a fourth report exists.
 */
function StatSection<T>({
  label,
  section,
  render,
  onRetry,
}: {
  label: string;
  section: Section<T> | undefined;
  render: (data: T) => { value: ReactNode; delta?: ReactNode; tone?: "neutral" | "up" | "warn" };
  onRetry: () => void;
}) {
  if (section === undefined) return <StatCard label={label} value="" loading />;

  if (section.state === "ok") {
    const { value, delta, tone } = render(section.data);
    return <StatCard label={label} value={value} delta={delta} tone={tone} />;
  }

  return (
    <Card>
      <p className="hint">{label}</p>
      <SectionState section={section} onRetry={onRetry} />
    </Card>
  );
}

/** The two second-factor tiles, which read one report between them. */
function FactorSection({
  label,
  factor,
  section,
  onRetry,
}: {
  label: string;
  factor: string;
  section: Section<MfaAdoption> | undefined;
  onRetry: () => void;
}) {
  return (
    <StatSection
      label={label}
      section={section}
      onRetry={onRetry}
      render={(adoption) => {
        const entry = adoption.factors.find((candidate) => candidate.factor === factor);
        if (entry === undefined) {
          return {
            value: "Not reported",
            delta: "The API's report does not cover this factor.",
          };
        }
        return {
          value: formatCount(entry.enrolled_events),
          // Both numbers, because the pair is the honest read: a factor whose
          // removals keep pace with its enrolments is churning, and neither
          // number says that alone. No ratio is derived from them, because
          // these count events and not accounts.
          delta: `${formatCount(entry.enrolled_events_in_window)} enrolled and ${formatCount(
            entry.removed_events_in_window,
          )} removed in the last ${describeWindow(adoption.window_days)}`,
          tone: entry.enrolled_events_in_window > entry.removed_events_in_window ? "up" : "neutral",
        };
      }}
    />
  );
}

/** The latest stored digest, or the reason there is not one. */
function DigestCard({ section, onRetry }: { section: Section<DigestRun>; onRetry: () => void }) {
  if (section.state !== "ok") {
    return (
      <div className="digest">
        <div className="digest-head">
          <IconSparkle />
          <b>Stored digest</b>
        </div>
        <SectionState section={section} onRetry={onRetry} />
      </div>
    );
  }

  const run = section.data;
  return (
    <div className="digest">
      <div className="digest-head">
        <IconSparkle />
        <b>Latest stored digest</b>
        <span className="dim">generated {formatInstant(run.generated_at)}</span>
      </div>
      {/* The engine's own report, rendered as text and never as markup. It is
          also the one place a dash this console did not write can reach the
          screen: this is the API's prose, passed through rather than restyled. */}
      <pre className="digest-text">{run.text}</pre>
    </div>
  );
}

/** The newest accounts, which is the same read the total came from. */
function NewestAccounts({
  section,
  onRetry,
}: {
  section: Section<AccountsSection> | undefined;
  onRetry: () => void;
}) {
  if (section !== undefined && section.state !== "ok") {
    return (
      <Card>
        <SectionState section={section} onRetry={onRetry} />
      </Card>
    );
  }

  const columns: ReadonlyArray<Column<AdminUser>> = [
    {
      key: "account",
      header: "Account",
      cell: (user) => <span className="mono">{user.email}</span>,
    },
    {
      key: "created",
      header: "Created",
      cell: (user) => <span className="dim">{formatInstant(user.created_at)}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (user) =>
        user.locked ? <Pill tone="red">locked</Pill> : <Pill tone="green">active</Pill>,
    },
  ];

  return (
    <Card>
      <DataTable
        caption="The newest accounts on this deployment"
        columns={columns}
        rows={section?.state === "ok" ? section.data.newest : []}
        rowKey={(user) => user.id}
        loading={section === undefined}
        skeletonRows={5}
        minWidthPx={520}
        emptyState={
          <EmptyState
            title="No accounts yet"
            description="The API counts no accounts on this deployment. The first account to sign up appears here."
          />
        }
      />
    </Card>
  );
}

/** The first paint: the shape of the screen, with nothing claimed in it. */
function LoadingDashboard() {
  return (
    <div className="view anim">
      <LoadingAnnouncement>Loading the dashboard reports</LoadingAnnouncement>
      <div className="digest">
        <div className="digest-head">
          <IconSparkle />
          <b>Stored digest</b>
        </div>
        <Skeleton variant="text" width="70%" />
      </div>
      <div className="section-title">Overview</div>
      <div className="grid cols-4">
        <StatCard label="Total users" value="" loading />
        <StatCard label="Authenticator apps" value="" loading />
        <StatCard label="Passkeys" value="" loading />
        <StatCard label="Password hashes" value="" loading />
      </div>
      <div className="section-title">Newest accounts</div>
      <Card>
        <Skeleton variant="row" />
        <Skeleton variant="row" />
        <Skeleton variant="row" />
      </Card>
    </div>
  );
}
