"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/Button";
import { BrandIcon, isKnownBrand } from "@/components/brand-icons";
import { Card } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { IconLink } from "@/components/icons";
import { Pill } from "@/components/Pill";
import { SectionState } from "@/components/section-state";
import { EmptyState, ErrorState, LoadingAnnouncement } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import { CSRF_HEADER } from "@/lib/csrf-header";
import {
  OAUTH_STATUS_DEGRADED,
  OAUTH_STATUS_NOT_CONFIGURED,
  OAUTH_STATUS_OK,
  OAUTH_STATUS_UNREACHABLE,
  OAUTH_TEST_COST_DETAIL,
  OAUTH_TEST_NOT_CONFIGURED_DETAIL,
  describeOAuthStatus,
} from "@/lib/oauth";
// Types only, and deliberately so: `providers.ts` and `admin.ts` are
// server-only, and a value import from either would fail the build. Type
// imports are erased before the bundler sees them, which is what lets the
// browser and the route that feeds it agree on one shape instead of two
// that drift.
import type { OAuthProviderHealth, OAuthProviderSummary } from "@/server/cryden/admin";
import type { OAuthProvidersPage } from "@/server/oauth/providers";

/**
 * The OAuth Providers screen's data, rendered.
 *
 * The list is one read of the console's route, answered from configuration
 * alone: what the deployment can speak to, and whether it holds credentials.
 * Reachability is deliberately not on the list, because answering it costs
 * an outbound request per provider; it lives behind each row's Test button,
 * which asks the console's test route for one provider and shows the verdict
 * beside the row it belongs to. A test's verdict stays beside its row until
 * the next test of the same provider replaces it: a verdict is a result, not
 * a transient, and the operator asked for it.
 *
 * One test runs at a time. The list answers from configuration and cannot
 * change under a running test, so there is nothing to race; disabling the
 * other buttons while one is in flight is about not spending four probes
 * because the operator clicked quickly, not about ordering.
 */

type Load =
  | { kind: "loading" }
  | { kind: "failed"; failure: ConsoleFailure }
  | { kind: "ok"; page: OAuthProvidersPage };

/** One row's most recent test result, kept beside the list, keyed by provider. */
type Verdicts = Record<
  string,
  { verdict: OAuthProviderHealth | null; failure: ConsoleFailure | null }
>;

const CONSOLE_UNREACHABLE: ConsoleFailure = {
  message: "The console could not reach its own server, so the provider list was not read.",
  code: "console_unreachable",
};

const CONSOLE_MALFORMED: ConsoleFailure = {
  message: "The console answered the provider list with a shape this screen does not recognise.",
  code: "console_malformed",
};

const TEST_UNREACHABLE: ConsoleFailure = {
  message: "The console could not reach its own server, so the provider was not tested.",
  code: "console_unreachable",
};

const CONSOLE_TEST_MALFORMED: ConsoleFailure = {
  message: "The console answered the test with a shape this screen does not recognise.",
  code: "console_malformed",
};

/** The pill tone each verdict reads as, and nothing more. */
function statusTone(status: string): "green" | "red" | "amber" | "neutral" {
  switch (status) {
    case OAUTH_STATUS_OK:
      return "green";
    case OAUTH_STATUS_DEGRADED:
      return "amber";
    case OAUTH_STATUS_UNREACHABLE:
      return "red";
    case OAUTH_STATUS_NOT_CONFIGURED:
      return "neutral";
    default:
      return "neutral";
  }
}

/** The short label a verdict gets in the pill, before its sentence. */
function statusLabel(status: string): string {
  switch (status) {
    case OAUTH_STATUS_OK:
      return "reachable";
    case OAUTH_STATUS_DEGRADED:
      return "degraded";
    case OAUTH_STATUS_UNREACHABLE:
      return "unreachable";
    case OAUTH_STATUS_NOT_CONFIGURED:
      return "not configured";
    default:
      return status;
  }
}

export function OAuthProvidersView({ csrf }: { csrf: string }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [verdicts, setVerdicts] = useState<Verdicts>({});
  const [testing, setTesting] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  const read = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    let response: Response;
    try {
      response = await fetch("/api/console/oauth/providers", {
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

    const page = dataFrom<OAuthProvidersPage>(payload);
    if (page === null) {
      setLoad({ kind: "failed", failure: CONSOLE_MALFORMED });
      return;
    }

    setLoad({ kind: "ok", page });
  }, []);

  useEffect(() => {
    void read();
    return () => inFlight.current?.abort();
  }, [read]);

  const retry = useCallback(() => {
    setLoad({ kind: "loading" });
    void read();
  }, [read]);

  const test = useCallback(
    async (provider: string) => {
      setTesting(provider);

      let response: Response;
      try {
        response = await fetch(`/api/console/oauth/${encodeURIComponent(provider)}/test`, {
          method: "POST",
          credentials: "same-origin",
          headers: { accept: "application/json", [CSRF_HEADER]: csrf },
        });
      } catch {
        setTesting(null);
        setVerdicts((current) => ({
          ...current,
          [provider]: { verdict: null, failure: TEST_UNREACHABLE },
        }));
        return;
      }

      const payload: unknown = await response.json().catch(() => null);
      setTesting(null);

      if (!response.ok) {
        setVerdicts((current) => ({
          ...current,
          [provider]: { verdict: null, failure: failureFrom(payload, response.status) },
        }));
        return;
      }

      const verdict = dataFrom<OAuthProviderHealth>(payload);
      if (verdict === null) {
        setVerdicts((current) => ({
          ...current,
          [provider]: { verdict: null, failure: CONSOLE_TEST_MALFORMED },
        }));
        return;
      }

      setVerdicts((current) => ({ ...current, [provider]: { verdict, failure: null } }));
    },
    [csrf],
  );

  const providers = load.kind === "ok" && load.page.state === "ok" ? load.page.data : null;

  let body;
  if (load.kind === "failed") {
    body = (
      <Card>
        <ErrorState
          bare
          title="The provider list did not load"
          description={load.failure.message}
          code={load.failure.code ?? undefined}
          onRetry={retry}
        />
      </Card>
    );
  } else if (load.kind === "ok" && load.page.state !== "ok") {
    body = (
      <Card>
        <SectionState section={load.page} onRetry={retry} />
      </Card>
    );
  } else {
    // In this branch the page section is ok, so the rows are real even when
    // the list is still empty.
    const rows = providers ?? [];
    body = (
      <Card>
        <p className="hint">{OAUTH_TEST_COST_DETAIL}</p>
        <DataTable
          caption="OAuth providers on this deployment"
          columns={columns(test, testing, verdicts)}
          rows={rows}
          rowKey={(row) => row.provider}
          loading={rows.length === 0 && load.kind === "loading"}
          skeletonRows={4}
          minWidthPx={560}
          emptyState={
            <EmptyState
              icon={<IconLink />}
              title="No providers to report"
              description="The API answered with no providers at all, which this console does not expect: the API reports every provider it can speak to, configured or not."
            />
          }
        />
      </Card>
    );
  }

  return (
    <div className="view anim">
      {load.kind === "loading" ? (
        <LoadingAnnouncement>Loading the providers</LoadingAnnouncement>
      ) : null}
      {body}
    </div>
  );
}

/** The table's columns, built with the test handler the rows will call. */
function columns(
  onTest: (provider: string) => void,
  testing: string | null,
  verdicts: Verdicts,
): ReadonlyArray<Column<OAuthProviderSummary>> {
  return [
    {
      key: "provider",
      header: "Provider",
      // The mark is how an operator recognises the row, which is what the
      // prototype's card grid was doing with it; a provider the console has
      // no artwork for keeps the plain name rather than an empty chip.
      cell: (row) => (
        <div className="oauth-provider">
          {isKnownBrand(row.provider) ? (
            <span className="oauth-icon">
              <BrandIcon provider={row.provider} />
            </span>
          ) : null}
          <span className="mono">{row.provider}</span>
        </div>
      ),
    },
    {
      key: "credentials",
      header: "Configured",
      cell: (row) =>
        row.configured ? (
          <Pill tone="green">configured</Pill>
        ) : (
          <Pill tone="neutral">not configured</Pill>
        ),
    },
    {
      key: "reachability",
      header: "Reachability",
      cell: (row) => (
        <TestCell provider={row} verdicts={verdicts} testing={testing} onTest={onTest} />
      ),
    },
  ];
}

/**
 * One row's reachability cell: the button that asks for a verdict, and the
 * latest verdict this screen holds, rendered beside it.
 *
 * A failed test renders its failure, not nothing: the operator clicked a
 * button and is owed an answer, and a silent cell would read as a test that
 * never ran. A `not_configured` refusal from the API is worded as the
 * deployment's configuration rather than the provider's health, which is
 * what that refusal means.
 */
function TestCell({
  provider,
  verdicts,
  testing,
  onTest,
}: {
  provider: OAuthProviderSummary;
  verdicts: Verdicts;
  testing: string | null;
  onTest: (provider: string) => void;
}) {
  const result = verdicts[provider.provider];

  return (
    <div className="oauth-test">
      <div className="oauth-test-row">
        {provider.configured ? (
          <Button
            size="small"
            disabled={testing !== null}
            onClick={() => onTest(provider.provider)}
          >
            {testing === provider.provider ? "Testing" : "Test"}
          </Button>
        ) : (
          <span className="dim">No credentials to test</span>
        )}
        {result?.verdict !== undefined && result.verdict !== null ? (
          <Pill
            tone={statusTone(result.verdict.status)}
            title={describeOAuthStatus(result.verdict.status)}
          >
            {statusLabel(result.verdict.status)}
            {result.verdict.latency_ms !== undefined
              ? ` · ${formatLatency(result.verdict.latency_ms)}`
              : ""}
          </Pill>
        ) : null}
      </div>
      {result?.failure !== undefined && result.failure !== null ? (
        <p className="oauth-test-failure" role="alert">
          {result.failure.code === "not_found"
            ? OAUTH_TEST_NOT_CONFIGURED_DETAIL
            : result.failure.message}
        </p>
      ) : null}
    </div>
  );
}

/** A probe's latency, in the unit the API reports. */
function formatLatency(ms: number): string {
  return `${ms} ms`;
}
