# Hazard

> **DO NOT EDIT BELOW THIS LINE UNLESS YOU KNOW WHAT YOU ARE DOING**

---

## Hazard name

Caddy reverse proxy lacks rate limiting

---

## General utility label

[2]

---

## Likelihood scoring

TBC

---

## Severity scoring

TBC

---

## Description

Caddy reverse proxy configuration has no rate limiting directive, allowing DoS attacks that can overwhelm backend services and make clinical system unavailable.

---

## Causes

1. Caddyfile defines routes but no rate_limit middleware
2. No request throttling or connection limits
3. Attacker can flood /api endpoints with unlimited requests

---

## Effect

Backend overwhelmed with requests, becomes unresponsive to legitimate clinical users.

---

## Hazard

Clinical system unavailable during attack, clinicians cannot access patient data for treatment decisions.

---

## Hazard type

- Unavailable

---

## Harm

Delayed treatment while clinicians use backup paper system. Potential patient harm in emergencies where rapid access to clinical information (allergies, medications, lab results) affects treatment decisions.

---

## Existing controls

None identified during initial analysis.

---

## Assignment

Clinical Safety Officer

---

## Labelling

TBC (awaiting scoring)

---

## Project

Clinical Risk Management

---

## Hazard controls

### Design controls (manufacturer)

- Add rate limiting plugin to Caddyfile: install caddy-rate-limit plugin. Configure global rate limit: 100 requests/minute per IP address. Stricter limits for sensitive endpoints: login (10/minute), registration (5/minute), password reset (3/minute). Example: rate_limit {zone static 10r/s} in Caddyfile.
- Implement distributed rate limiting using Redis: store rate limit counters in Redis shared across multiple Caddy instances. Prevents attacker bypassing limits by distributing requests across multiple proxy instances. Use token bucket algorithm with configurable burst size.
- Add connection limiting: max_conns 100 per IP address prevents single attacker opening thousands of connections. Configure timeout: idle_timeout 30s closes idle connections promptly.
- Implement IP reputation-based rate limiting: maintain IP blocklist for known attack sources. Rate limit known malicious IPs more aggressively (1 request/minute). Allow trusted IPs (hospital IP ranges) higher limits. Update blocklist from threat intelligence feeds.
- Add DDoS protection mode: detect attack patterns (sudden spike in requests from single IP or range). Automatically enable stricter rate limits during attack: 10 requests/minute global limit. Display maintenance page to excessive requestors. Alert operations team.

### Testing controls (manufacturer)

- Load test: Send 150 requests/minute from single IP address to /api/patients. Assert first 100 requests succeed (200 OK). Assert requests 101-150 return 429 Too Many Requests with Retry-After header.
- Distributed attack test: Send 50 requests/minute from 10 different IP addresses simultaneously (500 requests/minute total). Verify each IP independently rate limited. Verify backend does not become overwhelmed (response times <1 second).
- Login brute force test: Send 15 login attempts in 1 minute from single IP. Assert first 10 succeed, remaining 5 return 429. Assert error message: "Too many login attempts. Try again in X seconds."
- Connection limit test: Open 150 concurrent connections from single IP. Assert connections 101-150 rejected. Monitor backend connection count, verify never exceeds 100 connections from single IP.
- DDoS simulation: Send 1000 requests/second from botnet of 100 IPs (simulated). Verify DDoS protection mode activates. Verify legitimate users can still access system (may experience slower response times but not complete unavailability).

### Training controls (deployment)

- Train operations team on rate limit monitoring: check Caddy logs for 429 responses, identify attack patterns (high 429 rate from single IP range), understand when to enable DDoS protection mode manually.
- Document rate limit configuration: explain rate limit values chosen, how to adjust limits via Caddyfile, procedure for adding IPs to allowlist/blocklist.

### Business process controls (deployment)

- Rate limit monitoring: Monitor 429 response rate. Alert if 429 rate exceeds 5% of total requests (indicates attack or misconfigured limits). Alert triggers within 2 minutes.
- IP blocklist management: Security team reviews attack logs weekly. Add confirmed attack source IPs to blocklist. Remove IPs from blocklist after 90 days (IP may be reassigned).
- Incident response: During DoS attack, immediately enable DDoS protection mode via Caddyfile update and reload. Identify attack source IPs, add to blocklist. Contact hosting provider to implement upstream filtering if attack volume exceeds Caddy capacity.
- Capacity planning: Review rate limit effectiveness quarterly. If legitimate users frequently hit limits (>10 users/month report "too many requests" errors), increase limits. Balance security vs usability.
- SystemUnavailable

---

## Residual hazard risk assessment

TBC — awaiting initial controls implementation.

---

## Hazard status

Draft from LLM

---

## Code associated with hazard

- caddy/dev/Caddyfile
