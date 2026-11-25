import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { describeConfig, type ConfigEntry } from "@/server/config";
import { readSession } from "@/server/auth/guard";

import { ConsoleTopbar } from "../console-topbar";
import { SignOutButton } from "../sign-out-button";

export const metadata: Metadata = { title: "Runtime Config" };

const SOURCE_LABELS: Record<ConfigEntry["source"], string> = {
  env: "Environment",
  "env-file": "Environment file",
  file: "Config file",
  default: "Built-in default",
  unset: "Not configured",
};

const DESCRIPTIONS: Record<string, string> = {
  CSAX_API_URL: "Address of the CSAG API used by this console.",
  CRYDEN_MODE: "Selects the live API or fixtures adapter.",
  CSAX_STORE_URL: "PostgreSQL connection for the console's own metadata store.",
  CSAX_STORE_SQLITE_PATH: "SQLite file for the console's own metadata store.",
  READONLY_DATABASE_URL: "Separate read-only database connection for AI-assisted queries.",
  CSAX_SESSION_SECRET: "Signing key for the console's encrypted operator session cookie.",
  CSAX_VAULT_KEY: "Encryption key for secrets stored in the console vault.",
  WEBAUTHN_ORIGIN: "Allowed browser origin for console passkey ceremonies.",
  LOG_LEVEL: "Minimum server log severity.",
  SKIP_AUTO_MIGRATE: "Whether console-store migrations are skipped at startup.",
};

export default async function RuntimeConfigPage() {
  const session = await readSession();
  if (session === null) redirect("/login");

  const entries = describeConfig();

  return (
    <>
      <ConsoleTopbar
        title="Runtime Config"
        subtitle="Review where console settings come from without exposing their values."
        actions={<SignOutButton csrf={session.csrf} />}
      />
      <div className="view anim">
        <Card
          title="Configuration sources"
          hint="Values are never sent to the browser from this view."
        >
          <div className="table-wrap">
            <div className="table-scroll">
              <table>
                <caption className="sr-only">Runtime configuration sources</caption>
                <thead>
                  <tr>
                    <th scope="col">Setting</th>
                    <th scope="col">Source</th>
                    <th scope="col">Value handling</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.key}>
                      <td>
                        <code>{entry.key}</code>
                        <div className="hint">{DESCRIPTIONS[entry.key] ?? "Runtime setting."}</div>
                      </td>
                      <td>
                        <Pill dot={false}>{SOURCE_LABELS[entry.source]}</Pill>
                      </td>
                      <td>
                        {entry.sensitive ? (
                          <Pill tone="amber" dot={false}>
                            Sensitive, hidden
                          </Pill>
                        ) : (
                          <span className="hint">Not displayed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
        <Card title="Database scope">
          <p className="hint">
            This page describes the Next.js console process. Its console store is separate from
            CSAG&apos;s authentication database. <code>READONLY_DATABASE_URL</code>, when
            configured, is a separate read-only connection for AI queries; it does not reuse
            CSAG&apos;s <code>DATABASE_URL</code>.
          </p>
        </Card>
      </div>
    </>
  );
}
