# Deployment

> **Status: not built.** The Dockerfile, the Compose file, the Kubernetes manifest and the CI
> workflow arrive in step 5.6. Nothing on this page has been run, so treat it as the shape of the
> plan rather than as instructions. It will be replaced with tested commands, including the exact
> image tag, when those files exist. What is in the [What is true today](#what-is-true-today)
> section is verified.

## What is true today

These hold for the current build and will not change, so a deployment can be designed around them
now.

**The server is a standalone bundle.** `next.config.ts` sets `output: "standalone"`, so a
production build produces a self-contained server with `node_modules` pruned to what it actually
imports. There is no separate build step at deploy time.

```bash
pnpm install
pnpm build
cp -r public .next/standalone/            # both copies are required, see below
cp -r .next/static .next/standalone/.next/
node .next/standalone/server.js
```

**The two copies are not optional.** Next writes `.next/standalone/` with the server and its
dependencies, but not the files it serves as-is: `public/` and `.next/static/` are left where the
build put them. Without copying them the server starts and serves HTML, and every stylesheet,
script and image request falls through to the console's catch-all route, which answers a signed-out
visitor with a redirect to `/login`. The page then renders unstyled and unhydrated, which looks
like a broken deployment rather than a missing `cp`.

**`pnpm start` is not the production entry point.** It runs `next start`, and Next warns:
`"next start" does not work with "output: standalone" configuration. Use "node
.next/standalone/server.js" instead.` It happens to serve, which is worse than failing, so the
`start` script is replaced with the standalone entry point in step 5.6 along with the image.

**Boot is fail-fast.** `instrumentation.ts` validates the configuration and opens the console store
before the first request is served. A misconfigured deployment stops with a readable list rather
than failing on whichever screen touches the missing setting. Every problem is reported at once,
and no value is ever printed.

Required at boot: `CSAX_API_URL`, `CSAX_SESSION_SECRET`, `CSAX_VAULT_KEY`, `WEBAUTHN_RP_ID` and
`WEBAUTHN_ORIGIN`.

**`/` is the only static route.** Everything under `(console)` reads the session, so it is dynamic
and differs per operator. The landing page can be cached hard by a CDN; the console cannot.

**Cookies are `Secure` in production.** `NODE_ENV=production` forces the flag, and it is also forced
whenever `WEBAUTHN_ORIGIN` is an `https://` origin. A production deployment reached over plain HTTP
will look like a sign-in that silently does nothing, because the browser drops a `Secure` cookie it
received over `http`.

**The WebAuthn origin is enforced.** Route handlers refuse a request whose `Origin` is not
`WEBAUTHN_ORIGIN`. A reverse proxy must forward the original `Host` and scheme, and the deployment
must be reachable at exactly one name: a console answering on both `console.example.com` and
`csax.example.com` will refuse sign-in on whichever one is not configured.

**Secrets are read from the environment or from a `_FILE` path**, and every setting has both forms.
See [configuration.md](configuration.md#why-a-file-variant-exists).

## What a deployment needs

| | |
|---|---|
| The console | one container or process, plus a reverse proxy terminating TLS |
| The API | reachable from the console at `CSAX_API_URL`, ideally on a private network |
| The console store | Postgres 13+, or a SQLite file on a persistent volume |
| The engine's database | **not** reachable from the console. Only the API talks to it |
| DNS and TLS | one name, and the certificate for it |

Four secrets at minimum: `CSAX_SESSION_SECRET`, `CSAX_VAULT_KEY`, and whatever credential the
console store needs. Generate the first two with `openssl rand -base64 32`, and keep them out of
your image, your Compose file and your manifests: the `_FILE` variants exist so a mounted secret
can be handed over as a path.

## The intended shapes

### Docker Compose

Two services, `console` and `db`, on a private network, with the API either on the same network or
pointed at by `CSAX_API_URL`. The console's port is published only to the reverse proxy. Secrets go
in a `secrets:` block mounted as files, and the environment names their paths:
`CSAX_SESSION_SECRET_FILE=/run/secrets/csax_session_secret`.

### Kubernetes

A `Deployment` with a readiness probe on `/readyz` (step 5.5; today the closest thing is a request
to `/`, which is static and proves only that the process is up), a `Secret` mounted as a volume, and
a `HorizontalPodAutoscaler` only if the console store is Postgres, since SQLite on a shared volume
does not survive two replicas. `SKIP_AUTO_MIGRATE=1` and a migration `Job` is the right shape once
more than one replica exists, because otherwise they race.

### A platform as a service

Any host that runs a Node server and gives you environment variables will work. The two things to
get right are the same two as everywhere else: exactly one origin, and secrets injected rather than
baked into the image.

### A reverse proxy

Terminate TLS, forward `Host` and `X-Forwarded-Proto` unchanged, and do not rewrite the origin. Set
`WEBAUTHN_ORIGIN` to the public origin and `WEBAUTHN_RP_ID` to its registrable domain. If the
console is behind a path prefix rather than a hostname, it needs `basePath` in `next.config.ts`,
which is not configured today.

## Hardening, in step 5.5

Arrives with the deployment files, and includes:

- A strict Content Security Policy and the rest of the security headers.
- Rate limiting on the sign-in routes, and lockout after repeated failures.
- `/healthz` for liveness and `/readyz` for readiness, distinct from the API's own `/v1/health`.
- Structured JSON logs at the configured `LOG_LEVEL`, with the never-logged list from
  [SECURITY.md](../../SECURITY.md#what-is-never-logged) enforced.

## A deployment checklist

For when the files above exist. Everything here is checkable by hand today.

- [ ] `WEBAUTHN_RP_ID` is a bare domain, and it is the one you will still want in a year.
- [ ] `WEBAUTHN_ORIGIN` is the exact origin operators browse to, including the port if there is one.
- [ ] The console answers on exactly one name.
- [ ] `CSAX_SESSION_SECRET` and `CSAX_VAULT_KEY` are 32 random bytes each, from a secret store and
      not from the image.
- [ ] `NODE_ENV=production`, so cookies are `Secure`.
- [ ] TLS terminates at the proxy and the certificate is valid, or the WebAuthn ceremony refuses.
- [ ] The engine's database is not reachable from the console. Only `READONLY_DATABASE_URL`, if you
      have set it, and only from the AI layer.
- [ ] The console store is on a persistent volume, or in Postgres.
- [ ] A boot with one setting missing stops with a message naming it, and prints no value. Try it.
- [ ] The landing page loads with no request to any host other than your own.
- [ ] Two operators can sign in, and one can be removed with the CLI without touching the console.
