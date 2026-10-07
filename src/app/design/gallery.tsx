"use client";

import { useState } from "react";

import { Button } from "@/components/Button";
import { Card, StatCard } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { Modal } from "@/components/Modal";
import { Pill } from "@/components/Pill";
import { AppShell } from "@/components/Shell";
import { EmptyState, ErrorState, Skeleton } from "@/components/states";
import { SidebarProvider } from "@/components/shell-context";
import { useToast } from "@/components/Toast";
import { Toggle } from "@/components/Toggle";
import { Topbar } from "@/components/Topbar";
import { IconInbox } from "@/components/icons";
import {
  API_STATUS_DETAILS,
  API_STATUS_LABELS,
  apiStatusClass,
  type ApiStatus,
} from "@/lib/api-status";

type PreviewRow = {
  id: string;
  label: string;
  state: string;
};

const PREVIEW_ROWS: ReadonlyArray<PreviewRow> = [
  { id: "row_1", label: "Preview row one", state: "active" },
  { id: "row_2", label: "Preview row two", state: "pending" },
  { id: "row_3", label: "Preview row three", state: "blocked" },
];

const COLUMNS: ReadonlyArray<Column<PreviewRow>> = [
  { key: "label", header: "Row", cell: (row) => <span>{row.label}</span> },
  { key: "id", header: "Id", cell: (row) => <span className="mono dim">{row.id}</span> },
  {
    key: "state",
    header: "State",
    align: "right",
    cell: (row) => (
      <Pill tone={row.state === "active" ? "green" : row.state === "blocked" ? "red" : "amber"}>
        {row.state}
      </Pill>
    ),
  },
];

const STATUSES: ReadonlyArray<ApiStatus> = ["api-client", "degraded", "fixtures", "offline"];

function GalleryBody() {
  const toast = useToast();
  const [promptOpen, setPromptOpen] = useState(false);
  const [wideOpen, setWideOpen] = useState(false);
  const [switches, setSwitches] = useState({ first: true, second: false });

  return (
    <>
      <section className="gallery-block">
        <h2>Buttons</h2>
        <div className="gallery-row">
          <Button>Default</Button>
          <Button variant="primary">Primary</Button>
          <Button variant="danger-ghost">Revoke</Button>
          <Button size="small">Small</Button>
          <Button disabled>Disabled</Button>
        </div>
      </section>

      <section className="gallery-block">
        <h2>Pills</h2>
        <div className="gallery-row">
          <Pill tone="green">active</Pill>
          <Pill tone="amber">pending</Pill>
          <Pill tone="red">revoked</Pill>
          <Pill tone="neutral">unset</Pill>
          <Pill tone="neutral" dot={false}>
            read-only
          </Pill>
        </div>
      </section>

      <section className="gallery-block">
        <h2>Cards and stats</h2>
        <div className="grid cols-3">
          <StatCard label="Users" value="1,204" delta="+38 this week" tone="up" />
          <StatCard label="Open anomalies" value="3" delta="2 unreviewed" tone="warn" />
          <StatCard label="Loading" value="" loading />
        </div>
      </section>

      <section className="gallery-block">
        <h2>Toggles</h2>
        <div className="gallery-row">
          <Toggle
            label="First setting"
            visibleLabel="First setting"
            checked={switches.first}
            onChange={(next) => setSwitches((s) => ({ ...s, first: next }))}
          />
          <Toggle
            label="Second setting"
            visibleLabel="Second setting"
            checked={switches.second}
            onChange={(next) => setSwitches((s) => ({ ...s, second: next }))}
          />
          <Toggle
            label="Locked setting"
            visibleLabel="Locked setting"
            checked={false}
            disabled
            disabledReason="Locked off: this console has no write path for it."
            onChange={() => undefined}
          />
        </div>
      </section>

      <section className="gallery-block">
        <h2>Table, loaded</h2>
        <DataTable
          caption="Preview rows"
          columns={COLUMNS}
          rows={PREVIEW_ROWS}
          rowKey={(row) => row.id}
          rowLabel={(row) => `Open ${row.label}`}
        />
      </section>

      <section className="gallery-block">
        <h2>Table, loading</h2>
        <DataTable
          caption="Preview rows while loading"
          columns={COLUMNS}
          rows={[]}
          rowKey={(row) => row.id}
          loading
          skeletonRows={3}
        />
      </section>

      <section className="gallery-block">
        <h2>Table, empty</h2>
        <DataTable
          caption="Preview rows when empty"
          columns={COLUMNS}
          rows={[]}
          rowKey={(row) => row.id}
          emptyState={
            <EmptyState
              icon={<IconInbox />}
              title="Nothing here yet"
              description="This preview has no rows, which is what a real empty result looks like."
            />
          }
        />
      </section>

      <section className="gallery-block">
        <h2>Table, failed</h2>
        <DataTable
          caption="Preview rows when the call fails"
          columns={COLUMNS}
          rows={[]}
          rowKey={(row) => row.id}
          errorState={
            <ErrorState
              description="The preview could not load its rows."
              code="preview_unavailable"
              onRetry={() => toast.success("Retried")}
            />
          }
        />
      </section>

      <section className="gallery-block">
        <h2>Dialogs</h2>
        <div className="gallery-row">
          <Button onClick={() => setPromptOpen(true)}>Open prompt</Button>
          <Button onClick={() => setWideOpen(true)}>Open wide</Button>
        </div>
      </section>

      <section className="gallery-block">
        <h2>Toasts</h2>
        <div className="gallery-row">
          <Button onClick={() => toast.success("Saved")}>Success toast</Button>
          <Button onClick={() => toast.error("That did not save")}>Error toast</Button>
        </div>
      </section>

      <section className="gallery-block">
        <h2>Skeletons</h2>
        <Card title="Loading shapes" hint="Text line, stat value, table row">
          <div className="stack">
            <Skeleton variant="text" />
            <Skeleton variant="value" />
            <Skeleton variant="row" />
          </div>
        </Card>
      </section>

      <Modal
        open={promptOpen}
        onClose={() => setPromptOpen(false)}
        title="Confirm this action"
        description="Dialogs open with focus inside, keep Tab inside, close on Escape, and hand focus back."
      />
      <Modal
        open={wideOpen}
        onClose={() => setWideOpen(false)}
        variant="wide"
        title="Wide dialog"
        description="Used for forms and detail views."
        actions={
          <div className="actions-row" style={{ marginTop: 16 }}>
            <Button variant="primary" onClick={() => setWideOpen(false)}>
              Save
            </Button>
            <Button onClick={() => setWideOpen(false)}>Cancel</Button>
          </div>
        }
      />
    </>
  );
}

function StatusStrips() {
  return (
    <section className="gallery-block">
      <h2>Topbar status</h2>
      <div className="gallery-row">
        {STATUSES.map((status) => (
          <span key={status} className={apiStatusClass(status)} title={API_STATUS_DETAILS[status]}>
            {API_STATUS_LABELS[status]}
          </span>
        ))}
      </div>
    </section>
  );
}

/** Dev-only design-system preview. Not linked from the console and not shipped. */
export function DesignGallery() {
  return (
    <SidebarProvider>
      <AppShell
        badges={{ sessions: 2, anomalies: 1 }}
        operator={{
          initials: "PV",
          name: "Preview operator",
          roleLabel: "Preview only, not a real account",
        }}
      >
        <Topbar
          title="Design system"
          subtitle="Every component, every state. Development only."
          status="fixtures"
          statusLabel={API_STATUS_LABELS.fixtures}
          statusDetail={API_STATUS_DETAILS.fixtures}
        />
        <div className="view anim">
          <StatusStrips />
          <GalleryBody />
        </div>
      </AppShell>
    </SidebarProvider>
  );
}
