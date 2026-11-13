"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Toggle } from "@/components/Toggle";
import { ErrorState, LoadingAnnouncement } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import type { DigestSchedule } from "@/server/cryden/admin";

const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export function DigestScheduleView({ csrf }: { csrf: string }) {
  const [schedule, setSchedule] = useState<DigestSchedule | null>(null);
  const [recipientText, setRecipientText] = useState("");
  const [failure, setFailure] = useState<ConsoleFailure | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const read = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    try {
      const response = await fetch("/api/console/digest/settings", {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setFailure(failureFrom(payload, response.status));
        return;
      }
      const result = dataFrom<DigestSchedule>(payload);
      if (result === null || !isDigestSchedule(result)) {
        setFailure({
          message: "The API returned digest settings this screen does not recognise.",
          code: "console_malformed",
        });
        return;
      }
      setSchedule(result);
      setRecipientText(result.recipients.join("\n"));
    } catch {
      setFailure({
        message: "The console could not reach its server.",
        code: "console_unreachable",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void read();
  }, [read]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (schedule === null) return;
    setSaving(true);
    setFailure(null);
    const recipients = recipientText
      .split(/[\n,]/)
      .map((recipient) => recipient.trim())
      .filter(Boolean);
    try {
      const response = await fetch("/api/console/digest/settings", {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "x-csrf-token": csrf,
        },
        body: JSON.stringify({
          enabled: schedule.enabled,
          day_of_week: schedule.day_of_week,
          time: schedule.time,
          timezone: schedule.timezone,
          recipients,
          delivery_enabled: schedule.delivery_available && schedule.delivery_enabled,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setFailure(failureFrom(payload, response.status));
        return;
      }
      const result = dataFrom<DigestSchedule>(payload);
      if (result === null || !isDigestSchedule(result)) {
        setFailure({
          message: "The API returned saved digest settings this screen does not recognise.",
          code: "console_malformed",
        });
        return;
      }
      setSchedule(result);
      setRecipientText(result.recipients.join("\n"));
    } catch {
      setFailure({
        message: "The console could not reach its server.",
        code: "console_unreachable",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="view anim">
      <Card title="Digest schedule" hint="Choose when CSAG generates and stores the weekly report.">
        {loading && schedule === null ? (
          <LoadingAnnouncement>Loading digest schedule</LoadingAnnouncement>
        ) : null}
        {failure && schedule === null ? (
          <ErrorState
            title="Digest settings did not load"
            description={failure.message}
            code={failure.code ?? undefined}
            onRetry={() => void read()}
          />
        ) : null}
        {schedule ? (
          <form onSubmit={(event) => void save(event)}>
            <div className="field-row">
              <Toggle
                label="Generate the weekly digest"
                visibleLabel="Generate the weekly digest"
                checked={schedule.enabled}
                onChange={(enabled) => setSchedule({ ...schedule, enabled })}
              />
            </div>
            <div className="form-grid" style={{ marginTop: 18 }}>
              <label className="field-label" htmlFor="digest-day">
                Day of week
                <select
                  id="digest-day"
                  className="text-input"
                  value={schedule.day_of_week}
                  onChange={(event) =>
                    setSchedule({
                      ...schedule,
                      day_of_week: event.target.value as DigestSchedule["day_of_week"],
                    })
                  }
                >
                  {WEEKDAYS.map((day) => (
                    <option key={day} value={day}>
                      {day[0]?.toUpperCase()}
                      {day.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label" htmlFor="digest-time">
                Local time
                <input
                  id="digest-time"
                  className="text-input"
                  type="time"
                  value={schedule.time}
                  onChange={(event) => setSchedule({ ...schedule, time: event.target.value })}
                  required
                />
              </label>
              <label className="field-label" htmlFor="digest-timezone">
                Timezone
                <input
                  id="digest-timezone"
                  className="text-input"
                  value={schedule.timezone}
                  onChange={(event) => setSchedule({ ...schedule, timezone: event.target.value })}
                  placeholder="Africa/Casablanca"
                  maxLength={64}
                  required
                />
              </label>
            </div>
            <label className="field-label" htmlFor="digest-recipients" style={{ marginTop: 18 }}>
              Email recipients
              <textarea
                id="digest-recipients"
                className="text-input"
                rows={4}
                maxLength={6000}
                value={recipientText}
                onChange={(event) => setRecipientText(event.target.value)}
                placeholder="security@example.com"
              />
              <span className="hint">Enter up to 20 addresses, one per line.</span>
            </label>
            <div className="field-row" style={{ marginTop: 16 }}>
              <Toggle
                label="Send the digest by email"
                visibleLabel="Send the digest by email"
                checked={schedule.delivery_enabled}
                disabled={!schedule.delivery_available}
                disabledReason="This CSAG build has no host-provided digest email sender."
                onChange={(delivery_enabled) => setSchedule({ ...schedule, delivery_enabled })}
              />
            </div>
            {!schedule.delivery_available ? (
              <p className="hint" style={{ marginTop: 12 }}>
                This CSAG build can generate and store reports, but has no email sender. Recipients
                can be saved for a host integration; delivery stays off here.
              </p>
            ) : null}
            {failure && schedule ? (
              <div style={{ marginTop: 16 }}>
                <ErrorState
                  title="Digest settings were not saved"
                  description={failure.message}
                  code={failure.code ?? undefined}
                />
              </div>
            ) : null}
            <div className="actions-row" style={{ marginTop: 18 }}>
              <Button type="submit" variant="primary" disabled={saving || loading}>
                {saving ? "Saving…" : "Save schedule"}
              </Button>
              <Button type="button" onClick={() => void read()} disabled={saving || loading}>
                Refresh settings
              </Button>
            </div>
          </form>
        ) : null}
      </Card>
    </div>
  );
}

function isDigestSchedule(value: DigestSchedule): boolean {
  return (
    typeof value.enabled === "boolean" &&
    WEEKDAYS.includes(value.day_of_week) &&
    typeof value.time === "string" &&
    typeof value.timezone === "string" &&
    Array.isArray(value.recipients) &&
    typeof value.delivery_enabled === "boolean" &&
    typeof value.delivery_available === "boolean"
  );
}
