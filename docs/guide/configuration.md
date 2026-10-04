# Configuration

Every setting resolves in one order, and a value that is set but wrong stops the console at boot
rather than surfacing later on whichever screen touches it.

## Resolution order

For a setting named `FOO`, the loader tries these in turn and takes the first that answers:

| | Source | Notes |
|---|---|---|
| 1 | `FOO` in the environment | the usual case |
| 2 | the file named by `FOO_FILE` | one trailing newline is trimmed; this is what a container secret mount uses |
| 3 | `FOO` in the JSON config file | `csax.config.json` by default, or the path in `CSAX_CONFIG_FILE` |
| 4 | a documented default | non-sensitive settings only |

Two rules run through all four:

- **A blank value falls through.** `CSAX_API_URL=` in a `.env` file means "not set", because that
  is what it means nine times out of ten. Use `_FILE` with a file containing whitespace if you
  genuinely need to be explicit, which is to say: you do not.
- **The first source that answers wins, and it is not merged.** If the environment sets
  `LOG_LEVEL`, the config file's `LOG_LEVEL` is never read. This is why the Settings screen can show
  the provenance of every setting without ambiguity.

### Why a `_FILE` variant exists

`FOO_FILE` names a file whose contents are the value of `FOO`. It is the indirection every
container secret mechanism actually uses: a Docker secret, a Kubernetes secret volume, and systemd's
`LoadCredential` all hand you a path rather than a value. Reading the value straight out of the
environment also puts it in `docker inspect`, in `/proc/<pid>/environ`, and in any crash dump that
includes the environment, which is why the path indirection is offered for every setting rather
than only for the secret ones.

### The config file

`csax.config.json`, or whatever `CSAX_CONFIG_FILE` names. It is the local fallback, so a missing
file is not an error. A file that exists and cannot be parsed **is** an error: silently ignoring it
would mean booting with settings you believe you set.

Only JSON is parsed. A path ending in anything else, `.toml` included, is refused rather than
ignored. `csax.config.example.json` in the repository root is a working starting point, and it
deliberately contains no secrets: this file is meant to be committed.

```json
{
  "CSAX_API_URL": "http://127.0.0.1:8080",
  "CRYDEN_MODE": "fixtures",
  "WEBAUTHN_RP_ID": "localhost",
  "WEBAUTHN_RP_NAME": "csax+ console",
  "WEBAUTHN_ORIGIN": "http://localhost:3000",
  "LOG_LEVEL": "info"
}
```

## The settings

A **secret** is masked everywhere it could appear: the boot failure message, the log output, and the
Settings screen's configuration view, which shows where each setting came from and never what it is.

### The API

| Key | Required | Default | Secret |
|---|---|---|---|
| `CSAX_API_URL` | yes | none | no |
| `CRYDEN_MODE` | no | `live` | no |

`CSAX_API_URL` is the base URL of the CrydenSync HTTP API. The console calls `/v1/*` and
`/v1/admin/*` under it. It is the same name the CLI's API-client mode uses, so one deployment's
notes describe both.

`CRYDEN_MODE` is `live` or `fixtures` and nothing else.

- **`live`** calls `CSAX_API_URL`. A call that fails stays a failure.
- **`fixtures`** serves labelled sample data for offline demos. It is never a fallback: the mode is
  read from configuration, and only the fixtures adapter can produce the `fixtures` tag on screen.

### The console's own store

| Key | Required | Default | Secret |
|---|---|---|---|
| `CSAX_STORE_URL` | one of the two | none | **yes** |
| `CSAX_STORE_SQLITE_PATH` | one of the two | `.csaxplus/console.sqlite` | no |

The console keeps a small database of its own: step-up passkeys, vault secrets, console audit
entries and UI preferences. It is not the engine's database and must not share credentials with it.

Exactly one of the two may be set. Setting both is a boot error rather than a coin toss. Setting
neither uses the default SQLite path under the working directory, which is what lets a fresh
checkout run with no database at all; that file is gitignored.

`CSAX_STORE_URL` is marked secret because a connection string carries a password. A failure to
reach the store stops the process at boot, naming the reason and never the URL.

### The read-only role

| Key | Required | Default | Secret |
|---|---|---|---|
| `READONLY_DATABASE_URL` | no | none | **yes** |

A SELECT-only role against the engine's database, used by the read-only AI query templates. It is
the only database credential any AI code path may hold. Unset means the AI query features report
themselves unavailable rather than reaching for a credential they were not given.

### Session and vault keys

| Key | Required | Default | Secret |
|---|---|---|---|
| `CSAX_SESSION_SECRET` | yes | none | **yes** |
| `CSAX_VAULT_KEY` | yes | none | **yes** |

Both are 32 random bytes, base64 encoded, and both are checked at boot. `openssl rand -base64 32`
generates one.

- `CSAX_SESSION_SECRET` signs and encrypts the operator's session cookie. Rotating it signs every
  operator out, which is the intended way to do that.
- `CSAX_VAULT_KEY` is the AES-256-GCM key for secrets at rest. Rotating it requires re-encrypting
  what is in the vault; the rotation flow arrives with the vault itself in step 5.2.

Neither is ever logged, and neither decodes into anything an error message would print.

### WebAuthn

| Key | Required | Default | Secret |
|---|---|---|---|
| `WEBAUTHN_RP_ID` | yes | none | no |
| `WEBAUTHN_RP_NAME` | no | `csax+ console` | no |
| `WEBAUTHN_ORIGIN` | yes | none | no |

- `WEBAUTHN_RP_ID` is the relying party: a bare registrable domain, no scheme and no port. It must
  be stable, because a passkey registered under one RP ID cannot be used under another.
- `WEBAUTHN_RP_NAME` is what the operating system shows in its passkey prompt.
- `WEBAUTHN_ORIGIN` is the full origin including scheme and port. The console's route handlers
  refuse any request whose `Origin` header is not this value, which means a deployment reachable at
  two names must pick one. `http://localhost:3000` and `http://127.0.0.1:3000` are different
  origins: browsing the other one is a refused sign-in, not a convenience.

### Email

| Key | Required | Default | Secret |
|---|---|---|---|
| `RESEND_API_KEY` | no | none | **yes** |

Used by the Email screen for delivery stats and its test send. Optional: with no key the screen
reports it as absent rather than pretending delivery works. The engine itself sends no email at
all, so what this key drives is the console's own integration and not something the engine provides.

### AI provider

| Key | Required | Default | Secret |
|---|---|---|---|
| `LLM_PROVIDER` | no | none | no |
| `ANTHROPIC_API_KEY` | no | none | **yes** |
| `OPENAI_API_KEY` | no | none | **yes** |

`LLM_PROVIDER` is `anthropic`, `openai`, `azure-openai` or `openai-compatible`. Keys are read
through the secrets layer and are never sent to the browser.

Every AI feature is read-only, always. See
[the guarantee](secrets-and-passkeys.md#the-read-only-guarantee) and
[README section 8.1](../README.md#81-the-read-only-ai-guarantee).

### Operational

| Key | Required | Default | Secret |
|---|---|---|---|
| `LOG_LEVEL` | no | `info` | no |
| `SKIP_AUTO_MIGRATE` | no | `0` | no |
| `CSAX_CONFIG_FILE` | no | `csax.config.json` | no |

`LOG_LEVEL` is `error`, `warn`, `info` or `debug`. It is validated and carried on the config object
today, and **nothing consumes it yet**: the console's logger arrives in step 5.5, and until then the
only output is three boot lines through `console.info` / `console.error`. It is documented here
because setting it is harmless and the value will start taking effect without a change.

`SKIP_AUTO_MIGRATE` stops the console applying its own store migrations at boot, which is what you
want when a migration is applied by a separate step, or when two replicas would otherwise race. It
accepts `1`, `true`, `yes` or `on`, and `0`, `false`, `no` or `off`; anything else is a boot error
rather than a silent false.

`CSAX_CONFIG_FILE` is not a setting so much as the pointer to them: it names the JSON file the third
source reads.

## What the Settings screen will show

Step 5.3 adds a configuration view built on the same loader, showing each setting, which source
answered it (`env`, `env-file`, `file` or `default`), and whether it is a secret. It shows
provenance and never content: for a secret it can tell you that the value came from a mounted file
and cannot tell you what it is, which is the useful half.
