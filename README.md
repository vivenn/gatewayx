# GatewayX

GatewayX is an API gateway: a single, authenticated entry point that sits in
front of a set of backend services (auth, users, orders, notifications, …)
and handles the concerns every one of those services would otherwise have to
duplicate — JWT verification, request routing, rate limiting, response
caching, structured logging, health checks, and resilience against slow or
failing backends.

It's built on [Fastify](https://fastify.dev/) + TypeScript, structured as
[Clean Architecture](#architecture) with dependency boundaries enforced by
folder layout, and wired together with [Awilix](https://github.com/jeffijoe/awilix)
for dependency injection.

## Table of contents

- [Status](#status)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Testing](#testing)
- [Docker](#docker)
- [Performance](#performance)
- [Security notes](#security-notes)
- [Project layout](#project-layout)

## Status

This is a staged build, not a finished product. **Tier 1 is fully
implemented, tested, and has been run end-to-end in Docker.** Later tiers are
scaffolded with real domain interfaces and infrastructure classes, but their
use cases throw `NotImplementedError` until built out — this keeps the app
boot-able and the intended shape visible ahead of implementation.

| Tier | Scope | Status |
|---|---|---|
| 1 | Reverse proxy, dynamic routing, JWT auth, error handling, logging, health checks, validation | Done |
| 2 | API keys, RBAC, Redis rate limiting, Redis caching, Swagger, CORS/Helmet/compression, timeouts | Stubbed |
| 3 | Retry policy, circuit breaker, Prometheus + Grafana, full CI/CD, 80% coverage | Stubbed |
| 4 | Service discovery, admin API, distributed breaker state, load testing | Not started |

What "stubbed" means concretely: the domain entities, repository interfaces,
and infrastructure classes for Tier 2/3 modules (`api-keys`, `rbac`,
`rate-limit`, `cache`, `circuit-breaker`) are real and registered in the DI
container — they just throw `NotImplementedError` (HTTP 501) when actually
invoked, rather than the app failing to boot. One partial exception:
`ValidateApiKeyUseCase`'s HMAC-SHA256 + pepper hashing logic is fully
implemented; only the Postgres repository beneath it is stubbed.

## Architecture

Clean Architecture, four layers, enforced by folder boundaries:

- **Presentation** — `src/modules/*/…routes.ts`, `…plugin.ts` (Fastify routes, request validation)
- **Application** — `src/modules/*/application/*.usecase.ts`
- **Domain** — `src/domain/`, `src/modules/*/domain/` (entities, repository interfaces, errors — zero framework imports)
- **Infrastructure** — `src/infrastructure/`, `src/modules/*/infrastructure/` (Postgres, Redis, JWT, proxy)
- **Shared** — `src/shared/` (middleware, constants, types)

Dependency injection is wired through an Awilix container
(`src/app/container.ts`), using explicit factory functions rather than
constructor-parameter reflection, which is more reliable under TypeScript's
compiled output.

### Key design decisions

1. The gateway's Postgres owns only `api_keys`, `routes`, and
   `rate_limit_overrides` — never a `users` table. JWTs are issued by an
   Auth Service; the gateway only verifies them (RS256, public key only).
2. API keys are hashed with HMAC-SHA256 + a server-side pepper, not bcrypt —
   bcrypt is for low-entropy passwords verified rarely, not high-entropy
   keys verified on every request. `API_KEY_PEPPER` is a required,
   schema-validated env var with no in-code default — the gateway refuses
   to boot rather than silently falling back to a guessable pepper.
3. The response cache key includes requester identity, not just
   method+path, to prevent one user's cached response leaking to another.
4. Rate-limit identity resolves to API key > authenticated user > IP, not
   all three stacked.
5. Circuit breaker state is in-process per pod, not Redis-shared — an
   accepted eventual-consistency tradeoff for lower request latency.
6. The reverse proxy streams request/response bodies; it never buffers a
   full payload in memory.
7. `/readiness` reads a background-refreshed snapshot, not a live fan-out
   to every dependency on every probe.
8. `CORS_ORIGINS=*` is convenient for local dev, but paired with
   `credentials: true` it would let any origin make credentialed requests.
   The gateway fails fast at boot if `NODE_ENV=production` and
   `CORS_ORIGINS` is still `*` — production deployments must set an
   explicit comma-separated origin allowlist.

## Getting started

```bash
npm install
cp .env.example .env
npm run keys:generate   # paste the printed PUBLIC key into .env as JWT_PUBLIC_KEY

# In separate terminals, start the mock backends the route table points at:
npm run mock:auth
npm run mock:user
npm run mock:order
npm run mock:notification

npm run dev              # gateway on :8080
```

Requires a local Redis and Postgres for `/readiness` to report fully healthy
(the gateway still boots and serves traffic without them — readiness will
just report those two dependencies as unhealthy).

Every env var in `.env` is validated at startup — the gateway refuses to
boot on a missing `JWT_PUBLIC_KEY`/`API_KEY_PEPPER` or a malformed value
rather than coming up half-working. `.env.example` ships placeholder
values for both; replace `API_KEY_PEPPER` with a real secret and set
`CORS_ORIGINS` to an explicit allowlist before running with
`NODE_ENV=production`.

### Routes

The gateway's route table (`src/config/routes.yaml` locally,
`src/config/routes.docker.yaml` in Docker) is static and validated at boot:

| Prefix | Upstream (local) | Auth |
|---|---|---|
| `/api/auth` | `http://localhost:3001` | none |
| `/api/users` | `http://localhost:3002` | JWT |
| `/api/orders` | `http://localhost:3003` | JWT |
| `/api/notifications` | `http://localhost:3004` | JWT |

### Gateway-owned endpoints (not proxied)

| Endpoint | Purpose |
|---|---|
| `GET /liveness` | Process-alive check, no dependency I/O — used by orchestrators to decide whether to restart the pod |
| `GET /readiness` | 200 if all dependencies are healthy per the last background-refreshed snapshot, 503 otherwise — used to decide whether to route traffic |
| `GET /health` | Same data as `/readiness`, always 200 — dashboard/human-facing, not used for orchestration decisions |
| `GET /metrics` | Placeholder Prometheus-format endpoint; real counters/histograms land in Tier 3 |

## Testing

```bash
npm test              # unit/integration tests — no external services required
npm run test:coverage
npm run typecheck
npm run lint
```

The test suite builds each module against fakes/real network calls to
ephemeral local servers, not against the full Awilix container — so it
never depends on a live Redis/Postgres/Docker. The proxy test spins up a
real upstream Fastify server on an ephemeral port; the JWT test signs and
verifies with real RSA keypairs generated via `node:crypto` — nothing is
mocked at the boundary being tested.

## Docker

```bash
docker compose up --build
```

Boots the gateway plus Redis, Postgres, and four mock backend services
(auth/user/order/notification on 3001-3004, each with a `/health` endpoint
and a `/force-fail` toggle for later resilience testing). Requires `.env`
to be populated first (see above) — `docker compose` reads it automatically
for `JWT_PUBLIC_KEY`/`API_KEY_PEPPER` substitution.

This has been run end-to-end: all six containers build and start, health
checks pass, an unauthenticated route proxies through to its backend, a
protected route rejects requests with no/invalid tokens, and a request
carrying a valid RS256 JWT proxies through successfully.

## Performance

Load-tested against the actual `docker compose` stack (all 6 containers,
patched dependencies) using [autocannon](https://github.com/mcollina/autocannon),
40 concurrent connections, 15-second runs. Four scenarios isolate where time
is actually spent: the gateway's own overhead, the reverse-proxy hop, and
the cost of RS256 JWT verification.

| Scenario | Median | p97.5 | p99 | Avg req/sec | Total requests |
|---|---|---|---|---|---|
| `GET /liveness` — gateway only, no proxy/backend | 17 ms | 39 ms | 49 ms | ~1,940 | 29k / 15s |
| `GET /api/auth/health` via gateway — unauthenticated proxy | 44 ms | 83 ms | 95 ms | ~818 | 12k / 15s |
| `GET /api/users/health` via gateway — JWT-protected proxy | 78 ms | 118 ms | 130 ms | ~487 | 7k / 15s |
| `GET /api/auth/health` **direct to backend**, bypassing the gateway | 9 ms | 19 ms | 21 ms | ~3,801 | 57k / 15s |

What this shows:

- **Proxy hop overhead ≈ 35 ms median** (44 ms via gateway vs. 9 ms direct).
  Most of this is Docker Desktop's Windows network virtualization
  (WSL2/Hyper-V NAT) adding cost per container-to-container hop, not
  Fastify or the proxy code itself — expect this to shrink substantially on
  a native Linux host or in a real cluster where services aren't all
  fighting over one loopback interface.
- **JWT verification overhead ≈ 34 ms median** (78 ms protected vs. 44 ms
  unauthenticated, both via the gateway). This one *is* real application
  cost, not environment noise: RS256 signature verification is CPU-bound
  work that runs on Node's single event loop thread per request, so it
  measurably reduces throughput under concurrent load (818 → 487 req/sec
  here). This is an inherent tradeoff of asymmetric signing, not a bug —
  worth knowing for capacity planning once real traffic volumes are in
  scope.

**Environment caveat:** these numbers were captured on a single Windows 11
dev machine (AMD Ryzen 9 5900HS, 16 GB RAM) running Docker Desktop, with the
gateway, all four mock backends, Redis, and Postgres competing for the same
CPU and virtualized network. They're useful for *relative* comparison
between these scenarios, not as an absolute throughput/latency figure for a
production deployment — no dedicated load testing against production-like
infrastructure has been done (that's Tier 4 scope, not started).

### Reproducing these numbers

```bash
docker compose up --build -d

# generate a short-lived RS256 keypair + signed test token (writes
# token.txt, updates .env's JWT_PUBLIC_KEY to match), then restart the
# gateway to pick up the new key:
npm run token:generate
docker compose up -d gateway
TOKEN=$(cat token.txt)

npx autocannon -c 40 -d 15 http://localhost:8080/liveness
npx autocannon -c 40 -d 15 http://localhost:8080/api/auth/health
npx autocannon -c 40 -d 15 -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/users/health
npx autocannon -c 40 -d 15 http://localhost:3001/api/auth/health   # bypass gateway, baseline
```

## Security notes

- JWT verification is RS256, public-key-only — the gateway can check a
  signature but can never mint a valid token itself. Expiry and issuer are
  verified in the same call (`fast-jwt`'s `createVerifier`).
- API key hashing is HMAC-SHA256 + a required server-side pepper, with a
  constant-time (`timingSafeEqual`) comparison — implemented even though
  the repository beneath it is still stubbed.
- CORS fails closed in production: booting with `NODE_ENV=production` and
  an unset/`*` `CORS_ORIGINS` is a startup error, not a runtime surprise.
- Error responses never leak internal details on 5xx — everything funnels
  through one handler that maps `DomainError`/`ZodError`/unhandled
  exceptions to a stable JSON envelope.
- Dependencies are kept audit-clean (`npm audit`) — see the commit history
  for the two production dependencies (`@fastify/http-proxy`, `fast-jwt`)
  that were upgraded after a critical-severity advisory was found in each.
- Not yet in place: rate limiting, RBAC, and request body/timeout limits
  are all Tier 2 scope and currently stubbed — treat this as an
  authenticated reverse proxy, not yet a hardened one, until those land.

## Project layout

See `src/` for the full module tree; each module folder mirrors the same
`domain/ → application/ → infrastructure/` shape regardless of whether it's
fully built (proxy, auth-jwt, health) or still stubbed (api-keys, rbac,
rate-limit, cache, circuit-breaker).
