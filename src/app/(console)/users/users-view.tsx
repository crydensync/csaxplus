"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { IconUsers } from "@/components/icons";
import { Pill } from "@/components/Pill";
import { SectionState } from "@/components/section-state";
import { EmptyState, ErrorState, LoadingAnnouncement, Skeleton } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import { formatCount, formatDate, formatInstant } from "@/lib/format";
import { EXACT_EMAIL_MISS_DETAIL, describeMatch } from "@/lib/users";
// Types only, and deliberately so: `browse.ts` and `admin.ts` are server-only,
// and a value import from either would fail the build. Type imports are erased
// before the bundler sees them, which is what lets the browser and the route
// that feeds it agree on one shape instead of two that drift.
import type { AdminUser, AdminUserList } from "@/server/cryden/admin";
import type { UserPage } from "@/server/users/browse";

import { UserDrawer } from "./user-drawer";
import { CreateAccount } from "./create-account";

/**
 * The Users screen's data, rendered.
 *
 * A client component because the read goes through the console's own route
 * handler: that is where the API tokens get renewed, and a server component
 * cannot write the cookie a renewal needs. See the route for the full reason.
 *
 * The screen holds one request at a time and never merges two answers. Search,
 * paging and retry all go through `ask`, which replaces the request the effect
 * is keyed on, so what is on screen is always the answer to the question that
 * was last asked rather than a page of one and a count from another.
 */

/** Which page of which query is being asked for. */
type Request = { query: string; offset: number };

type Load =
  | { kind: "loading" }
  | { kind: "failed"; failure: ConsoleFailure }
  | { kind: "ok"; page: UserPage };

const FIRST_PAGE: Request = { query: "", offset: 0 };

/** The console's own route could not be reached, so nothing was attempted. */
const CONSOLE_UNREACHABLE: ConsoleFailure = {
  message: "The console could not reach its own server. Check your connection and try again.",
  code: "console_unreachable",
};

/** The route answered with something this screen cannot read. */
const CONSOLE_MALFORMED: ConsoleFailure = {
  message: "The console answered the account list with a shape this screen does not recognise.",
  code: "console_malformed",
};

export function UsersView({ csrf }: { csrf: string }) {
  const [asked, setAsked] = useState<Request>(FIRST_PAGE);
  const [draft, setDraft] = useState("");
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [open, setOpen] = useState<AdminUser | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const searchId = useId();

  const read = useCallback(async (request: Request) => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    // Only what was asked for is sent. The page size is the route's default
    // rather than a number this screen repeats, and an offset of zero is the
    // absence of a request to move.
    const params = new URLSearchParams();
    if (request.query !== "") params.set("q", request.query);
    if (request.offset > 0) params.set("offset", String(request.offset));
    const search = params.toString();

    let response: Response;
    try {
      response = await fetch(
        search === "" ? "/api/console/users" : `/api/console/users?${search}`,
        {
          credentials: "same-origin",
          headers: { accept: "application/json" },
          signal: controller.signal,
        },
      );
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

    const page = dataFrom<UserPage>(payload);
    if (page === null) {
      setLoad({ kind: "failed", failure: CONSOLE_MALFORMED });
      return;
    }

    setLoad({ kind: "ok", page });
  }, []);

  useEffect(() => {
    void read(asked);
    return () => inFlight.current?.abort();
  }, [read, asked]);

  /**
   * Asks for a page, including the one already on screen.
   *
   * The request is stored as a fresh object every time, which is what makes the
   * effect above re-run for a repeat: searching for the address already
   * displayed has to reach the API again, because the operator asked a question
   * and an unchanged answer is not the same as no answer.
   */
  const ask = useCallback((request: Request) => {
    setOpen(null);
    setLoad({ kind: "loading" });
    setAsked({ ...request });
  }, []);

  const retry = useCallback(() => ask(asked), [ask, asked]);

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ask({ query: draft.trim(), offset: 0 });
  }

  function clearSearch() {
    setDraft("");
    ask(FIRST_PAGE);
  }

  const page = load.kind === "ok" ? load.page : null;
  const list = page !== null && page.state === "ok" ? page.data : null;
  const searching = asked.query !== "";

  let body;
  if (load.kind === "failed") {
    body = (
      <Card>
        <ErrorState
          bare
          title="The account list did not load"
          description={load.failure.message}
          code={load.failure.code ?? undefined}
          onRetry={retry}
        />
      </Card>
    );
  } else if (page !== null && page.state !== "ok") {
    body = (
      <Card>
        <SectionState section={page} onRetry={retry} />
      </Card>
    );
  } else {
    body = (
      <>
        <Card>
          <DataTable
            caption="Accounts on this deployment"
            columns={COLUMNS}
            rows={list?.users ?? []}
            rowKey={(user) => user.id}
            loading={list === null}
            skeletonRows={8}
            minWidthPx={720}
            onRowClick={(user) => setOpen(user)}
            rowLabel={(user) => `Open the details for ${user.email}`}
            emptyState={
              searching ? (
                <EmptyState
                  icon={<IconUsers />}
                  title="No account matched that address"
                  description={EXACT_EMAIL_MISS_DETAIL}
                  action={<Button onClick={clearSearch}>Clear the search</Button>}
                />
              ) : (
                <EmptyState
                  icon={<IconUsers />}
                  title="No accounts yet"
                  description="The API counts no accounts on this deployment. The first account to sign up appears here."
                />
              )
            }
          />
        </Card>

        <Pager data={list} onGo={(offset) => ask({ query: asked.query, offset })} />
      </>
    );
  }

  return (
    <div className="view anim">
      {load.kind === "loading" ? (
        <LoadingAnnouncement>Loading the accounts</LoadingAnnouncement>
      ) : null}

      <div className="users-toolbar">
        <form className="users-search" role="search" onSubmit={onSearch}>
          <div>
            <label htmlFor={searchId}>Search by exact email</label>
            <input
              id={searchId}
              type="search"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="someone@example.com"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
            />
          </div>
          <Button type="submit" variant="primary">
            Search
          </Button>
          {draft !== "" || searching ? (
            <Button type="button" onClick={clearSearch}>
              Clear
            </Button>
          ) : null}
        </form>

        {/* The toolbar is `space-between`, so the create affordance sits at its
            far edge, away from the search it must not be mistaken for. */}
        <CreateAccount
          csrf={csrf}
          onCreated={(user) => {
            // The created account goes straight into the drawer, the same
            // path a row click takes, so the operator sees what they made
            // rather than a list they must find it in. The list re-reads on
            // the drawer's close through `ask`, so the new row is there too.
            setOpen(user);
            void read(asked);
          }}
        />
      </div>

      {body}

      <UserDrawer user={open} csrf={csrf} onClose={() => setOpen(null)} />
    </div>
  );
}

/** The table's columns. Real fields only: see DECISIONS.md D19. */
const COLUMNS: ReadonlyArray<Column<AdminUser>> = [
  {
    key: "account",
    header: "Account",
    cell: (user) => <span className="mono">{user.email}</span>,
  },
  {
    key: "created",
    header: "Created",
    cell: (user) => <span className="dim">{formatDate(user.created_at)}</span>,
  },
  {
    key: "updated",
    header: "Last change",
    cell: (user) => <span className="dim">{formatDate(user.updated_at)}</span>,
  },
  {
    key: "failed",
    header: "Failed attempts",
    align: "right",
    cell: (user) =>
      user.failed_attempts === 0 ? (
        <span className="dim">0</span>
      ) : (
        <span className="mono">{formatCount(user.failed_attempts)}</span>
      ),
  },
  {
    key: "status",
    header: "Status",
    cell: (user) => <StatusPill user={user} />,
  },
];

/** Locked and active, with the lockout's own expiry where the API reported one. */
function StatusPill({ user }: { user: AdminUser }) {
  if (!user.locked) return <Pill tone="green">active</Pill>;
  return (
    <Pill
      tone="red"
      title={
        user.locked_until === null
          ? "Locked, with no expiry recorded"
          : `Locked until ${formatInstant(user.locked_until)}`
      }
    >
      locked
    </Pill>
  );
}

/**
 * The page controls.
 *
 * Every number comes from the answer: the offset the API applied, the page size
 * it used and the total it counted. The console does not hold a page size of its
 * own, so a screen and the API cannot disagree about where a page ends.
 */
function Pager({ data, onGo }: { data: AdminUserList | null; onGo: (offset: number) => void }) {
  if (data === null) {
    return (
      <div className="pager">
        <div className="pager-info" aria-hidden="true">
          <Skeleton variant="text" width="220px" />
        </div>
        <div className="pager-buttons">
          <Button size="small" disabled>
            Previous
          </Button>
          <Button size="small" disabled>
            Next
          </Button>
        </div>
      </div>
    );
  }

  const shown = data.users.length;
  const hasMore = data.offset + shown < data.total;
  const range =
    data.total === 0
      ? "No accounts in this answer"
      : `Showing ${formatCount(data.offset + 1)} to ${formatCount(
          data.offset + shown,
        )} of ${formatCount(data.total)}`;

  return (
    <div className="pager">
      <div className="pager-info">
        {range}. {describeMatch(data.match)}
      </div>
      <div className="pager-buttons">
        <Button
          size="small"
          disabled={data.offset === 0}
          onClick={() => onGo(Math.max(0, data.offset - data.limit))}
        >
          Previous
        </Button>
        <Button size="small" disabled={!hasMore} onClick={() => onGo(data.offset + data.limit)}>
          Next
        </Button>
      </div>
    </div>
  );
}
