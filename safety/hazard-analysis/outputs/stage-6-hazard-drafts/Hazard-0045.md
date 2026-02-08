# Hazard

> **DO NOT EDIT BELOW THIS LINE UNLESS YOU KNOW WHAT YOU ARE DOING**

---

## Hazard name

Docker containers lack resource limits

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

Docker Compose file defines resource limits for database containers but not for backend/frontend containers, allowing runaway processes to consume all host resources.

---

## Causes

1. Backend service has no mem_limit or cpus configuration
2. Runaway process (memory leak, infinite loop) can consume all host RAM/CPU
3. No OOM killer threshold or CPU quotas

---

## Effect

Backend container consumes all host RAM or CPU, causing entire system to freeze or crash.

---

## Hazard

Clinical system becomes unavailable until manual restart by IT staff, clinicians cannot access patient data.

---

## Hazard type

- Unavailable

---

## Harm

Delayed treatment while system is down. Potential patient harm in emergencies where rapid access to clinical information affects treatment decisions. Clinicians forced to use backup paper system causing data fragmentation.

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

- Add resource limits to backend container in compose.dev.yml: deploy.resources.limits.cpus: "2.0", deploy.resources.limits.memory: "2G". Prevents backend from using >2 CPUs or >2GB RAM. Reserves host resources for other services.
- Configure OOM (Out Of Memory) killer behavior: deploy.resources.reservations.memory: "1G" (guaranteed minimum), limits.memory: "2G" (maximum). If backend exceeds 2GB, Docker OOM killer terminates container. Set restart: unless-stopped to auto-restart after OOM kill.
- Add health check with resource monitoring: backend health check endpoint /api/health returns memory usage percentage, CPU usage. Docker marks container unhealthy if health check fails. Orchestrator (Docker Swarm or Kubernetes) can replace unhealthy container.
- Implement memory leak detection: add middleware that tracks Python memory usage (using tracemalloc). Log warning if memory growth >50MB/hour (indicates potential leak). Alert operations team if sustained memory growth detected.
- Add graceful degradation: when memory usage >80% of limit, backend enters degraded mode: disable non-critical features (push notifications, background tasks), return 503 Service Unavailable for some endpoints, display "System experiencing high load" message. Prevents complete failure.

### Testing controls (manufacturer)

- Memory limit test: Deploy backend with 500MB memory limit. Trigger memory-intensive operation (e.g., load 10,000 patients). Monitor memory usage. Verify backend killed by OOM killer when exceeds limit. Verify container auto-restarts after OOM kill.
- CPU limit test: Deploy backend with 0.5 CPU limit. Trigger CPU-intensive operation (e.g., cryptographic hash computation). Monitor CPU usage. Assert never exceeds 50% of single core (0.5 CPU limit enforced).
- Resource exhaustion test: Deliberately introduce memory leak (accumulate objects in global list). Run load test for 10 minutes. Verify memory leak detection middleware logs warnings. Verify backend enters degraded mode at 80% memory usage.
- Health check test: Backend consumes 2.5GB RAM (exceeds 2GB limit), gets killed by OOM killer. Verify health check fails after restart. Verify orchestrator marks container unhealthy. Simulate orchestrator replacing unhealthy container.

### Training controls (deployment)

- Train operations team on resource monitoring: check Docker stats for CPU/memory usage, understand when containers approaching limits, interpret OOM killer logs, restart containers manually if needed.
- Document resource limit rationale: explain why limits chosen (based on capacity planning), how to adjust limits if insufficient, when to scale horizontally (add more backend replicas) vs vertically (increase per-container limits).

### Business process controls (deployment)

- Capacity planning policy: Review container resource usage monthly. If average usage >70% of limits, increase limits by 25%. If sustained >90%, increase immediately. Document capacity changes in change log.
- Monitoring and alerting: Prometheus monitors container CPU and memory usage. Alert if usage >80% of limits for >5 minutes (warning), >90% for >2 minutes (critical). Alert triggers PagerDuty notification to on-call engineer.
- Incident response: During resource exhaustion incident, immediately increase container limits via compose file update and redeploy. Investigate root cause: memory leak, unexpected load spike, inefficient code. Fix underlying issue to prevent recurrence.
- OOM kill analysis: When container killed by OOM killer, capture heap dump (if available), analyze memory usage patterns. Identify memory leak source. Add test case for leak scenario. Fix leak in code. Deploy fix and verify memory usage stabilizes.
- SystemCrash
- SystemUnavailable

---

## Residual hazard risk assessment

TBC — awaiting initial controls implementation.

---

## Hazard status

Draft from LLM

---

## Code associated with hazard

- compose.dev.yml
