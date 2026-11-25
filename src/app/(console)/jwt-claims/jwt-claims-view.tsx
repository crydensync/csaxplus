"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { ErrorState, LoadingAnnouncement } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import type { JWTClaimMapping, JWTClaimsConfig } from "@/server/cryden/admin";

const SOURCES = [
  ["user.id", "User ID"],
  ["user.email", "Email address"],
  ["user.created_at", "Account created at"],
  ["user.updated_at", "Account updated at"],
  ["metadata.", "Per-user metadata key…"],
] as const;

export function JWTClaimsView({ csrf }: { csrf: string }) {
  const [config, setConfig] = useState<JWTClaimsConfig | null>(null);
  const [mappings, setMappings] = useState<JWTClaimMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<ConsoleFailure | null>(null);
  const [message, setMessage] = useState("");
  const [previewUserId, setPreviewUserId] = useState("");
  const [preview, setPreview] = useState<{ email: string; claims: Record<string, unknown> } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const read = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    try {
      const response = await fetch("/api/console/jwt-claims", { credentials: "same-origin" });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw Object.assign(new Error(failureFrom(payload, response.status).message), { failure: failureFrom(payload, response.status) });
      const value = dataFrom<JWTClaimsConfig>(payload);
      if (value === null || !Array.isArray(value.mappings) || !Array.isArray(value.reserved_claim_names))
        throw new Error("The API returned an unrecognised claim mapping.");
      setConfig(value);
      setMappings(value.mappings);
    } catch (error) {
      setFailure((error as { failure?: ConsoleFailure }).failure ?? {
        message: error instanceof Error ? error.message : "Claim mappings could not be loaded.",
        code: "console_unreachable",
      });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void read(); }, [read]);

  const update = (index: number, patch: Partial<JWTClaimMapping>) => {
    setMappings((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  };

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/console/jwt-claims", {
        method: "PUT", credentials: "same-origin",
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ mappings }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(failureFrom(payload, response.status).message);
      const value = dataFrom<JWTClaimsConfig>(payload);
      if (value === null) throw new Error("The API did not confirm the saved mappings.");
      setConfig(value);
      setMappings(value.mappings);
      setMessage("Mappings saved. Newly issued access tokens will use them.");
      setPreview(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Mappings could not be saved.");
    } finally { setSaving(false); }
  };

  const runPreview = async () => {
    setPreviewBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/console/jwt-claims", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ user_id: previewUserId.trim() }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(failureFrom(payload, response.status).message);
      const value = dataFrom<{ email: string; claims: Record<string, unknown> }>(payload);
      if (value === null || typeof value.email !== "string" || typeof value.claims !== "object" || value.claims === null)
        throw new Error("The API returned an unrecognised preview.");
      setPreview({ email: value.email, claims: value.claims });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The claims preview could not be loaded.");
    } finally { setPreviewBusy(false); }
  };

  if (loading) return <div className="view anim"><LoadingAnnouncement>Loading JWT claim mappings</LoadingAnnouncement></div>;
  if (failure && config === null) return <div className="view anim"><Card><ErrorState title="JWT claims did not load" description={failure.message} code={failure.code ?? undefined} onRetry={() => void read()} /></Card></div>;

  return (
    <div className="view anim">
      <Card title="Global source mappings" hint="Each source is copied to a custom claim for every user. Per-user metadata wins if it sets the same claim; CSAG's operator role is always controlled by its operators table.">
        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          {mappings.map((mapping, index) => (
            <div key={index} className="actions-row" style={{ alignItems: "end", flexWrap: "wrap" }}>
              <label className="field-label">Claim name<input className="text-input mono" value={mapping.claim} onChange={(event) => update(index, { claim: event.target.value })} placeholder="email_address" /></label>
              <label className="field-label">Source<select className="text-input" value={SOURCES.some(([source]) => source === mapping.source) ? mapping.source : mapping.source.startsWith("metadata.") ? "metadata." : mapping.source} onChange={(event) => update(index, { source: event.target.value })}>
                {SOURCES.map(([source, label]) => <option key={source} value={source}>{label}</option>)}
              </select></label>
              {mapping.source.startsWith("metadata.") ? <label className="field-label">Metadata key<input className="text-input mono" value={mapping.source.slice("metadata.".length)} onChange={(event) => update(index, { source: `metadata.${event.target.value}` })} placeholder="plan" /></label> : null}
              <Button variant="danger-ghost" disabled={saving} onClick={() => setMappings((current) => current.filter((_, i) => i !== index))}>Remove</Button>
            </div>
          ))}
          <div className="actions-row">
            <Button onClick={() => setMappings((current) => [...current, { claim: "", source: "user.email" }])} disabled={saving || mappings.length >= 32}>Add mapping</Button>
            <Button variant="primary" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save mappings"}</Button>
            <Pill tone="neutral">{config?.reserved_claim_names.length ?? 8} protected names</Pill>
          </div>
          {config?.reserved_claim_names.length ? <p className="hint">Protected claims: <span className="mono">{config.reserved_claim_names.join(", ")}</span></p> : null}
          {message ? <p className="hint" role="status">{message}</p> : null}
        </div>
      </Card>
      <Card title="Preview claims for an account" style={{ marginTop: 16 }} hint="CSAG runs the same claims provider used during token issuance against this account's current data. This shows additional claims, not a signed token.">
        <div className="actions-row" style={{ alignItems: "end", flexWrap: "wrap" }}>
          <label className="field-label">Account ID<input className="text-input mono" value={previewUserId} onChange={(event) => setPreviewUserId(event.target.value)} placeholder="UUID from the Users screen" /></label>
          <Button onClick={() => void runPreview()} disabled={previewBusy || !previewUserId.trim()}>{previewBusy ? "Loading…" : "Preview claims"}</Button>
        </div>
        {preview ? <><p className="hint" style={{ marginTop: 12 }}>{preview.email}</p><pre className="drawer-json" style={{ marginTop: 8, overflowWrap: "anywhere" }}>{JSON.stringify(preview.claims, null, 2)}</pre></> : null}
      </Card>
    </div>
  );
}
