# Redis Token Bucket Rate Limiter

A small distributed rate limiter built with Node.js, Express, and Redis. It uses a token bucket implemented in a Redis Lua script so that refilling, checking, consuming, and persisting bucket state happen atomically for each client.

## Features

- Per-client request limiting using the client IP address.
- Burst handling through a configurable token capacity.
- Smooth refill at a configurable tokens-per-second rate.
- Atomic Redis-side state transitions with Lua and `EVALSHA`.
- Standard response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `Retry-After`.
- Automatic cleanup of inactive client buckets after one hour.
- A Node.js benchmark script for measuring latency and throughput.

## Tech Stack

- **Node.js** with ES modules
- **Express 5** for the HTTP server and middleware pipeline
- **Redis 6+** for shared limiter state
- **redis** Node.js client for Redis access
- **Lua** for the atomic token bucket operation
- **autocannon** and the built-in `fetch` API for load testing
- **nodemon** for local development

## How It Works

The default configuration creates a bucket with:

- **Capacity:** 10 tokens
- **Refill rate:** 2 tokens per second
- **Request cost:** 1 token

Each client gets a Redis hash at `rate_limit:<client-id>` with two fields:

```text
tokens       Current fractional token balance
last_refill  Redis-server timestamp of the last calculation
```

For every request, the Lua script:

1. Reads the current time from Redis using `TIME`. Using Redis time keeps all application instances on the same clock.
2. Loads the client bucket state with `HMGET`.
3. Creates a full bucket for a new client.
4. Calculates elapsed time since the last refill.
5. Adds `elapsed time * refill rate` tokens, capped at the bucket capacity.
6. Allows the request and subtracts the requested tokens when enough tokens are available.
7. Otherwise rejects the request and calculates the milliseconds until enough tokens will be available.
8. Saves the new token balance and timestamp, then sets a one-hour expiry on the Redis key.

The entire operation runs as one Redis Lua script. Redis executes the script atomically, so concurrent requests cannot both observe and spend the same token. The JavaScript code loads the script once during startup and uses its SHA with `EVALSHA` for subsequent requests.

### Request outcomes

Allowed requests continue to the Express route and include:

```http
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 9
```

Rejected requests return HTTP `429 Too Many Requests`:

```json
{
  "error": "Too Many Requests",
  "retryAfterMs": 500
}
```

They also include `Retry-After` in seconds. For the default refill rate, an empty bucket takes up to 5 seconds to refill completely.

## Project Structure

```text
.
├── benchmarks/
│   └── p95.js                 # Concurrent latency and throughput benchmark
├── src/
│   ├── index.js               # Express server and limiter configuration
│   ├── limiter/
│   │   ├── tokenBucket.js     # JavaScript Redis limiter interface
│   │   └── tokenBucket.lua    # Atomic bucket calculation
│   └── middleware/
│       └── rateLimiter.js     # Express middleware and response headers
├── package.json
└── package-lock.json
```

## Getting Started

### Prerequisites

- Node.js 18 or newer
- Redis running locally on `localhost:6379`

### Install and run

```bash
npm install
npm start
```

The server starts at `http://localhost:3000` and exposes:

```text
GET /test
```

Example request:

```bash
curl -i http://localhost:3000/test
```

For development with automatic restarts:

```bash
npm run dev
```

Redis must be available before the application starts. The current example connects to `redis://localhost:6379`; change the URL in `src/index.js` when using a managed or remote Redis instance.

## Benchmarking

The included benchmark sends **10,000 requests** to `/test` using **50 concurrent workers** and reports total duration, throughput, minimum, average, p50, p95, p99, and maximum latency:

```bash
node benchmarks/p95.js
```

One supplied load-test run used 10 connections and produced the following results:

| Metric | Result |
| --- | ---: |
| Requests | 22,000 in 10.06 seconds |
| Throughput | 2,168.4 req/sec average |
| Latency p50 | 4 ms |
| Latency p97.5 | 6 ms |
| Latency p99 | 7 ms |
| Average latency | 4.17 ms |
| Maximum latency | 30 ms |
| Read bandwidth | 7.86 MB |
| Successful responses | 29 |
| Non-2xx responses | 21,648 |

The very high rejection count is expected for a limiter configured with a capacity of 10 and a refill rate of 2 tokens per second when many requests target the same client identity. The result demonstrates that rejected requests are handled quickly, but it is not a measure of unrestricted application throughput. Benchmark numbers will vary with Redis placement, CPU, network latency, client identity distribution, and load-generator settings.

## Configuration

The limiter is configured in `src/index.js`:

```js
const limiter = new TokenBucketLimiter(redis, {
  capacity: 10,
  refillRate: 2
});
```

`capacity` controls the maximum burst size. `refillRate` controls how many tokens are added per second. The middleware currently charges one token per request and uses `req.ip` as the client key.

For production use, consider making the Redis URL and limiter settings environment variables, selecting an identity appropriate to the deployment, and configuring Express proxy trust correctly when the service runs behind a reverse proxy. Otherwise, multiple users may appear to share a proxy IP, or client IPs may not be identified as intended.

## Applications

This pattern is useful for protecting:

- Public APIs from accidental or abusive request bursts
- Authentication and password-reset endpoints from brute-force attempts
- Expensive search, report, or export operations
- Shared backend services in a horizontally scaled deployment
- Per-tenant or per-user quotas in SaaS applications
- Infrastructure endpoints such as webhooks and callback receivers

The token bucket is a good fit when short bursts should be allowed while maintaining a long-term request rate.
