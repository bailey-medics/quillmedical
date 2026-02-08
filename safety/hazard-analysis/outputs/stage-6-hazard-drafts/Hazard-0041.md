# Hazard

> **DO NOT EDIT BELOW THIS LINE UNLESS YOU KNOW WHAT YOU ARE DOING**

---

## Hazard name

Database connection pool exhaustion

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

SQLAlchemy connection pool has default limits (pool_size=5) which may be insufficient for production load, causing new API requests to wait for connections or timeout.

---

## Causes

1. No explicit pool_size or max_overflow configuration in engine creation
2. Default pool_size=5 insufficient for concurrent production load
3. Long-running transactions hold connections preventing new requests
4. No connection pool monitoring or alerting

---

## Effect

New API requests wait for available database connection, timeout, or fail with connection pool exhausted errors.

---

## Hazard

Clinician unable to access patient data during high load periods (ward rounds, emergency situations with multiple concurrent users).

---

## Hazard type

- WrongPatientContext

---

## Harm

Delayed treatment while clinician waits for system to respond or uses backup paper system. Potential patient harm in time-critical situations where rapid access to clinical information affects treatment decisions.

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

- Configure SQLAlchemy connection pool with production-appropriate limits: create_engine(pool_size=20, max_overflow=10, pool_timeout=30, pool_recycle=3600). Pool size 20 allows 20 concurrent database operations. Max overflow 10 provides burst capacity (total 30 connections during spikes). Pool timeout 30 seconds raises error if no connection available within timeout.
- Implement connection pool monitoring: add middleware to track pool usage metrics (checked_out_connections, checked_in_connections, pool_size). Expose metrics via /api/metrics endpoint (protected with Administrator role). Alert operations team if checked_out/pool_size ratio >0.8 for >5 minutes (indicates pool approaching capacity).
- Add automatic connection cleanup: configure pool_pre_ping=True to test connections before using (detects stale connections). Set pool_recycle=3600 (recycle connections after 1 hour) prevents long-lived connections accumulating database-side resources.
- Implement transaction timeout: wrap database operations with contextmanager that sets statement_timeout=30 seconds at session start. Prevents long-running queries holding connections indefinitely. Raises OperationalError if query exceeds timeout.
- Add circuit breaker for database unavailability: after 5 consecutive connection failures, open circuit for 30 seconds (stop attempting new connections). Display error banner: "Database temporarily unavailable. Please try again shortly." Prevents connection pool exhaustion during database outages.

### Testing controls (manufacturer)

- Load test: Simulate 50 concurrent API requests requiring database connections. Measure response times. Assert all requests complete within 5 seconds. Assert no connection pool exhausted errors. Monitor checked_out_connections metric, verify never exceeds pool_size + max_overflow.
- Pool exhaustion test: Simulate 35 concurrent long-running transactions (exceeds pool_size + max_overflow). Assert 36th request waits for connection. Assert 36th request times out after pool_timeout seconds with error "QueuePool limit of size 20 overflow 10 reached."
- Stress test: Simulate 100 requests/second for 10 minutes. Monitor connection pool metrics. Assert pool usage stays <80% (max_overflow not needed). Assert no requests timeout. Verify system handles sustained load without pool exhaustion.
- Connection cleanup test: Create database session, execute query, deliberately leave connection open (don't commit or rollback). Wait for pool_recycle timeout (3600 seconds or mocked time). Assert connection forcibly closed and recycled by pool.

### Training controls (deployment)

- Train operations team on connection pool monitoring: check /api/metrics daily, watch for pool utilization >80%, understand pool_size vs max_overflow, escalate if sustained high utilization observed.
- Document connection pool capacity planning: guidelines for adjusting pool_size based on concurrent user count. Formula: pool_size = (concurrent_users _ 1.5). Max_overflow = pool_size _ 0.5. Update configuration if user count grows.

### Business process controls (deployment)

- Capacity planning policy: Review connection pool metrics monthly. If average pool utilization >60% for 1 month, increase pool_size by 5. If sustained >80%, increase immediately. Document capacity changes in change log.
- Monitoring and alerting: Prometheus/Grafana monitors connection pool metrics. Alert if pool utilization >80% for >5 minutes (warning), >90% for >2 minutes (critical). Alert triggers PagerDuty notification to on-call engineer.
- Incident response: During connection pool exhaustion incident, immediately increase pool_size and max_overflow via environment variable update (no code change required). Restart backend containers. Investigate root cause: slow queries, database performance issues, unexpected load spike. Document incident in post-mortem.
- Query optimization: Quarterly review of slow query logs (queries taking >5 seconds). Optimize slow queries with indexes, query rewriting, caching. Reduces connection hold time, improves pool availability.
- SystemUnavailable
- NoAccessToData

---

## Residual hazard risk assessment

TBC — awaiting initial controls implementation.

---

## Hazard status

Draft from LLM

---

## Code associated with hazard

- backend/app/db/auth_db.py
