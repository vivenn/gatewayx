# GatewayX

Authenticated API gateway for Fastify + TypeScript. Sits in front of your
backend services and handles the concerns they'd otherwise duplicate: JWT
verification, routing, rate limiting, caching, logging, health checks.

**[About](#about)** · **[Status](#status)** · **[Structure](#structure)** · **[Setup](#setup)** · **[Docker](#docker)** · **[Analytics](#analytics)** · **[Security](#security)**

---

## About

GatewayX is one authenticated entry point instead of N backend services each
reimplementing auth, routing, and rate limiting. Built on
[Fastify](https://fastify.dev/) + TypeScript, structured as Clean
Architecture (domain / application / infrastructure / presentation, enforced
by folder layout), wired with [Awilix](https://github.com/jeffijoe/awilix)
for DI.

**Design decisions:**

| #   | Decision                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Postgres owns `api_keys`/`routes`/`rate_limit_overrides` only, never `users`. JWTs are verified (RS256, public key only), never minted here. |
| 2   | API keys: HMAC-SHA256 + required pepper, constant-time compare — not bcrypt (built for slow password checks, not high-frequency key checks). |
| 3   | Cache key includes requester identity — no cross-user cache leaks.                                                                           |
| 4   | Rate-limit identity resolves API key → user → IP, not all three stacked.                                                                     |
| 5   | Circuit breaker state is in-process per pod, not Redis-shared (latency over cross-pod consistency).                                          |
| 6   | Reverse proxy streams bodies — never buffers a full payload in memory.                                                                       |
| 7   | `/readiness` reads a background-refreshed snapshot, not a live fan-out per probe.                                                            |
| 8   | Boot fails fast if `NODE_ENV=production` and `CORS_ORIGINS` is still `*`.                                                                    |

## Status

Staged build. **Tier 1 is implemented, tested, and verified end-to-end in
Docker.** Tiers 2-4 have real domain interfaces registered in the DI
container, but their use cases throw `NotImplementedError` (501) until
built — the app still boots and the shape is visible ahead of
implementation.

| Tier | Scope                                                                    | Status         |
| ---- | ------------------------------------------------------------------------ | -------------- |
| 1    | Reverse proxy, routing, JWT auth, error handling, logging, health checks | ✅ Done        |
| 2    | API keys, RBAC, Redis rate limiting, Redis caching, timeouts             | 🚧 Stubbed     |
| 3    | Retry policy, circuit breaker, Prometheus/Grafana, 80% coverage          | 🚧 Stubbed     |
| 4    | Service discovery, admin API, distributed breaker state, load testing    | ⬜ Not started |

## Structure

```
src/
├── app/              container.ts (Awilix DI), server.ts (composition root)
├── config/           env schema, route table (yaml), route schema
├── domain/errors/     framework-free DomainError hierarchy
├── infrastructure/   postgres, redis, logger clients
├── shared/           request-context + error-handler middleware, constants
└── modules/
    ├── auth-jwt/          ✅ RS256 verify-only JWT plugin
    ├── proxy/             ✅ dynamic routing + streaming reverse proxy
    ├── health/            ✅ liveness / readiness / health
    ├── metrics/           ✅ /metrics placeholder (real counters in Tier 3)
    ├── api-keys/          🚧 HMAC+pepper validation implemented, repo stubbed
    ├── rbac/              🚧 interfaces only
    ├── rate-limit/        🚧 interfaces only
    ├── cache/             🚧 interfaces only
    └── circuit-breaker/   🚧 interfaces only

mock-services/   one parameterized backend, run 4x (auth/user/order/notification)
scripts/         keys:generate, token:generate (dev/bench helpers)
tests/           integration tests against real ephemeral servers, no mocks
```

Every module folder follows `domain/ → application/ → infrastructure/`
regardless of whether it's built or stubbed.

## Setup

```bash
npm install
cp .env.example .env
npm run keys:generate        # paste PUBLIC key into .env as JWT_PUBLIC_KEY

npm run mock:auth             # + mock:user, mock:order, mock:notification
                               # (each in its own terminal)
npm run dev                   # gateway on :8080
```

Env vars are schema-validated at boot — missing `JWT_PUBLIC_KEY`/
`API_KEY_PEPPER` or malformed config means the process refuses to start.
`CORS_ORIGINS` must be an explicit allowlist once `NODE_ENV=production`.

Redis/Postgres are optional for local dev — `/readiness` just reports them
unhealthy if absent; the gateway still serves traffic.

| Route prefix         | Upstream | Auth |
| -------------------- | -------- | ---- |
| `/api/auth`          | `:3001`  | none |
| `/api/users`         | `:3002`  | JWT  |
| `/api/orders`        | `:3003`  | JWT  |
| `/api/notifications` | `:3004`  | JWT  |

| Endpoint         | Purpose                                                              |
| ---------------- | -------------------------------------------------------------------- |
| `GET /liveness`  | Process alive, no dependency I/O — restart signal                    |
| `GET /readiness` | 200/503 from the cached dependency snapshot — traffic-routing signal |
| `GET /health`    | Same data, always 200 — dashboard-facing                             |
| `GET /metrics`   | Prometheus-format placeholder                                        |

**Test:**

```bash
npm test              # 19 tests, no external services required
npm run test:coverage
npm run typecheck
npm run lint
```

## Docker

```bash
docker compose up --build
```

Boots gateway + Redis + Postgres + 4 mock backends. Requires `.env`
populated first — compose reads it for `JWT_PUBLIC_KEY`/`API_KEY_PEPPER`.

Verified end-to-end: all 6 containers build and start; unauthenticated
routes proxy through; protected routes reject missing/invalid tokens; a
valid RS256 JWT proxies through successfully.

## Analytics

Load-tested the running `docker compose` stack with
[autocannon](https://github.com/mcollina/autocannon) — 40 connections, 15s
runs — to separate gateway overhead from JWT cost:

| Scenario                                         | Median | p99    | Avg req/sec |
| ------------------------------------------------ | ------ | ------ | ----------- |
| `/liveness` — gateway only                       | 17 ms  | 49 ms  | ~1,940      |
| `/api/auth/health` via gateway — unauthenticated | 44 ms  | 95 ms  | ~818        |
| `/api/users/health` via gateway — JWT-protected  | 78 ms  | 130 ms | ~487        |
| Direct to backend — bypassing the gateway        | 9 ms   | 21 ms  | ~3,801      |

**Reading it:**

- **+35ms** proxy-hop cost (gateway vs. direct) — mostly Docker
  Desktop/Windows network virtualization, not app code. Expect less on
  native Linux or a real cluster.
- **+34ms, -40% throughput** from JWT verification alone (818 → 487
  req/sec) — RS256 signature checking is CPU-bound work on Node's single
  event loop. Real cost, not noise — worth knowing for capacity planning.

Captured on one Windows dev machine (Ryzen 9 5900HS, 16GB) with every
service sharing the same CPU/network — useful for _relative_ comparison
between these scenarios, not a production throughput figure. No
production-scale load testing has been done (Tier 4, not started).

**Reproduce:**

```bash
docker compose up --build -d
npm run token:generate && docker compose up -d gateway
TOKEN=$(cat token.txt)

npx autocannon -c 40 -d 15 http://localhost:8080/liveness
npx autocannon -c 40 -d 15 http://localhost:8080/api/auth/health
npx autocannon -c 40 -d 15 -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/users/health
npx autocannon -c 40 -d 15 http://localhost:3001/api/auth/health   # baseline
```

## Security

- JWT: RS256, public-key-only, expiry + issuer checked in one call — the
  gateway can verify a token but never mint one.
- API keys: HMAC-SHA256 + required pepper (no default), constant-time
  compare.
- CORS fails closed in production (`*` origin + boot in prod = startup
  error).
- Errors never leak internals on 5xx — one handler, one JSON envelope.
- Dependencies are audit-clean (`npm audit`) — two production packages
  (`@fastify/http-proxy`, `fast-jwt`) were upgraded after critical
  advisories were found in each.
- **Not yet enforced:** rate limiting, RBAC, request body/timeout limits —
  all Tier 2, still stubbed. This is an authenticated proxy today, not yet
  a hardened one.
