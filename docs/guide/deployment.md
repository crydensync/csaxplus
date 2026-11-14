# Deployment

The repository includes a standalone Node image, Docker Compose, a Kubernetes example, and a
GitHub Actions workflow. The image runs as a non-root user. Compose persists the default SQLite
console store; the Kubernetes example uses a separate PostgreSQL store and reads credentials from
mounted secret files.

The console's database is its own metadata store. It is separate from CSAG's authentication
database. CSAG connects to its `DATABASE_URL`; the console calls the API at `CSAX_API_URL`. The
optional `READONLY_DATABASE_URL` is only for the AI query feature and must use a SELECT-only role.

## Docker Compose

Copy the example environment file and generate two independent keys:

```bash
cp .env.docker.example .env.docker
openssl rand -base64 32
openssl rand -base64 32
```

Put one generated key in `CSAX_SESSION_SECRET`, the other in `CSAX_VAULT_KEY`, and set
`CSAX_API_URL` and `WEBAUTHN_ORIGIN` for the address operators will use. The example API URL uses
`host.docker.internal` so a local Docker container can reach a CSAG server running on the host.
For a remote deployment, set the private or public API address that the container can reach.

Start the console:

```bash
docker compose up --build -d
docker compose ps
docker compose logs -f console
```

Compose publishes the console on `127.0.0.1:3000` and stores its SQLite file in the named
`console-data` volume. Put a TLS reverse proxy in front for production and set `WEBAUTHN_ORIGIN` to
the exact HTTPS origin. To use PostgreSQL for the console store, set `CSAX_STORE_URL` in
`.env.docker`; do not also set `CSAX_STORE_SQLITE_PATH`. The engine's auth database is never used as
the console store automatically.

The image's health check uses `/readyz`. `/healthz` checks only process liveness. Both are
unauthenticated, no-store probes and do not return connection details.

## Kubernetes

The example in `deploy/kubernetes/console.yaml` expects an existing PostgreSQL database for the
console store and an existing Kubernetes Secret named `csaxplus-runtime`. Create the secret with
the plain configuration values in files:

```bash
kubectl create secret generic csaxplus-runtime \
  --from-file=store-url=./store-url.txt \
  --from-file=session-secret=./session-secret.txt \
  --from-file=vault-key=./vault-key.txt
kubectl apply -f deploy/kubernetes/console.yaml
```

The manifest mounts these files under `/run/secrets/csaxplus` and sets the matching `*_FILE`
variables. Edit the ConfigMap API URL and public origin, and replace the example image name with
the image you built or published. The sample runs one replica. If you scale beyond one, keep the
console store on PostgreSQL and apply migrations as a deliberate deployment step to avoid
concurrent startup migrations.

## Building the standalone server

The same standalone output used by the image can be built locally:

```bash
pnpm install --frozen-lockfile
pnpm build
node .next/standalone/server.js
```

The Dockerfile copies `public/` and `.next/static/` beside the standalone server, as Next.js leaves
those assets outside `.next/standalone` by default. Runtime configuration is still required; see
[configuration](configuration.md). Production sign-in requires HTTPS and an exact
`WEBAUTHN_ORIGIN` match.

## CI

`.github/workflows/ci.yml` runs on pushes to `main` and `feat/**`, pull requests, and manual
dispatch. It runs lint, typecheck, unit tests, Playwright with Chromium, the production build, and a
Docker image build. The workflow uses fixture mode and disposable keys; it contains no deployment
credentials.
